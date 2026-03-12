use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(target_os = "linux")]
use std::fs;
use std::io::{self, Read, Write};
#[cfg(target_os = "linux")]
use std::path::Path;
use std::path::PathBuf;
use std::process::{Child, Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tempfile::NamedTempFile;
use thiserror::Error;

const CPU_MONITOR_GRACE_MS: f64 = 100.0;
const CPU_MONITOR_MIN_ELAPSED_MS: u64 = 500;
const POLL_INTERVAL_MS: u64 = 50;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxRequest {
    pub node_path: String,
    pub worker_source: String,
    pub execute_message: Value,
    pub timeout_ms: u64,
    pub max_memory_mb: u32,
    pub max_cpu: u32,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SandboxResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl SandboxResponse {
    pub fn success(result: String) -> Self {
        Self {
            ok: true,
            result: Some(result),
            error: None,
        }
    }

    pub fn failure(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            result: None,
            error: Some(message.into()),
        }
    }
}

#[derive(Debug, Deserialize)]
struct WorkerMessage {
    #[serde(rename = "type")]
    message_type: String,
    result: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Error)]
pub enum RunnerError {
    #[error("{0}")]
    Message(String),
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn read_request_from_stdin() -> Result<SandboxRequest, RunnerError> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    if input.trim().is_empty() {
        return Err(RunnerError::Message(
            "Sandbox request body was empty".to_string(),
        ));
    }

    Ok(serde_json::from_str(&input)?)
}

pub fn write_response_to_stdout(response: &SandboxResponse) -> Result<(), RunnerError> {
    let serialized = serde_json::to_string(response)?;
    println!("{serialized}");
    Ok(())
}

pub fn run_request(request: SandboxRequest) -> Result<SandboxResponse, RunnerError> {
    let mut worker_file = NamedTempFile::new()?;
    worker_file.write_all(request.worker_source.as_bytes())?;
    worker_file.flush()?;

    let sandbox_directory = sandbox_directory(&request.execute_message);
    let max_memory_bytes = u64::from(request.max_memory_mb) * 1024 * 1024;
    #[cfg(not(target_os = "linux"))]
    let _ = max_memory_bytes;

    let mut command = Command::new(&request.node_path);
    command
        .arg(format!("--max-old-space-size={}", request.max_memory_mb))
        .arg(worker_file.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(directory) = sandbox_directory.as_deref() {
        command.current_dir(directory);
    }

    #[cfg(target_os = "linux")]
    configure_linux_child(
        &mut command,
        max_memory_bytes,
        cpu_time_limit_seconds(request.timeout_ms, request.max_cpu),
    )?;

    let mut child = command.spawn()?;

    #[cfg(target_os = "linux")]
    let cgroup_handle = maybe_attach_cgroup(child.id(), max_memory_bytes, request.max_cpu);

    write_execute_message(&mut child, &request.execute_message)?;
    let output = wait_for_child_output(child, request.timeout_ms, request.max_cpu)?;

    #[cfg(target_os = "linux")]
    drop(cgroup_handle);

    map_output_to_response(output, request.max_memory_mb)
}

fn sandbox_directory(message: &Value) -> Option<PathBuf> {
    message
        .get("sandboxDirectory")
        .and_then(Value::as_str)
        .map(PathBuf::from)
}

fn write_execute_message(child: &mut Child, message: &Value) -> Result<(), RunnerError> {
    let payload = serde_json::to_vec(message)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(&payload)?;
    }

    Ok(())
}

fn wait_for_child_output(
    mut child: Child,
    timeout_ms: u64,
    max_cpu: u32,
) -> Result<Output, RunnerError> {
    let started_at = Instant::now();
    loop {
        if child.try_wait()?.is_some() {
            break;
        }

        let elapsed_ms = started_at.elapsed().as_millis() as u64;
        if elapsed_ms >= timeout_ms {
            terminate_child(&mut child);
            return Err(RunnerError::Message("Tool execution timed out".to_string()));
        }

        if should_monitor_cpu(max_cpu) && elapsed_ms >= CPU_MONITOR_MIN_ELAPSED_MS {
            if let Some(cpu_time_ms) = read_process_cpu_time_ms(child.id())? {
                let allowed_cpu_ms = (elapsed_ms as f64 * (f64::from(max_cpu) / 100.0))
                    + CPU_MONITOR_GRACE_MS;
                if cpu_time_ms as f64 > allowed_cpu_ms {
                    terminate_child(&mut child);
                    return Err(RunnerError::Message(format!(
                        "Tool execution exceeded CPU limit ({max_cpu}%)"
                    )));
                }
            }
        }

        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }

    Ok(child.wait_with_output()?)
}
fn terminate_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn map_output_to_response(
    output: Output,
    max_memory_mb: u32,
) -> Result<SandboxResponse, RunnerError> {
    let stdout = String::from_utf8_lossy(&output.stdout);
    if let Some(message) = parse_worker_message(stdout.as_ref())? {
        return Ok(match message.message_type.as_str() {
            "result" => SandboxResponse::success(message.result.unwrap_or_default()),
            "error" => SandboxResponse::failure(
                message
                    .error
                    .unwrap_or_else(|| "Sandbox worker returned an empty error".to_string()),
            ),
            other => SandboxResponse::failure(format!(
                "Sandbox worker returned unknown message type: {other}"
            )),
        });
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if is_out_of_memory(&stderr) {
        return Ok(SandboxResponse::failure(format!(
            "Tool execution exceeded memory limit ({max_memory_mb} MB)"
        )));
    }

    if !stderr.is_empty() {
        return Ok(SandboxResponse::failure(stderr));
    }

    if let Some(code) = output.status.code() {
        if code != 0 {
            return Ok(SandboxResponse::failure(format!(
                "Tool process exited with code {code}"
            )));
        }
    }

    if let Some(signal) = exit_signal(&output.status) {
        return Ok(SandboxResponse::failure(format!(
            "Tool process killed by signal {signal}"
        )));
    }

    Ok(SandboxResponse::failure(
        "Sandbox worker exited without returning a result".to_string(),
    ))
}

fn parse_worker_message(stdout: &str) -> Result<Option<WorkerMessage>, RunnerError> {
    let Some(line) = stdout.lines().rev().find(|line| !line.trim().is_empty()) else {
        return Ok(None);
    };

    Ok(Some(serde_json::from_str(line.trim())?))
}

fn is_out_of_memory(stderr: &str) -> bool {
    let normalized = stderr.to_ascii_lowercase();
    normalized.contains("heap out of memory") || normalized.contains("allocation failed")
}

fn should_monitor_cpu(max_cpu: u32) -> bool {
    max_cpu > 0 && max_cpu < 100
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn cpu_time_limit_seconds(timeout_ms: u64, max_cpu: u32) -> u64 {
    let budget_seconds = ((timeout_ms as f64 / 1000.0)
        * (f64::from(max_cpu.max(1)) / 100.0))
        .ceil() as u64;
    budget_seconds.max(1)
}

#[cfg(unix)]
fn exit_signal(status: &std::process::ExitStatus) -> Option<i32> {
    use std::os::unix::process::ExitStatusExt;

    status.signal()
}

#[cfg(not(unix))]
fn exit_signal(_status: &std::process::ExitStatus) -> Option<i32> {
    None
}

#[cfg(target_os = "linux")]
fn configure_linux_child(
    command: &mut Command,
    max_memory_bytes: u64,
    cpu_limit_seconds: u64,
) -> Result<(), RunnerError> {
    use std::os::unix::process::CommandExt;

    unsafe {
        command.pre_exec(move || {
            apply_rlimit(libc::RLIMIT_AS, max_memory_bytes)?;
            apply_rlimit(libc::RLIMIT_CPU, cpu_limit_seconds)?;
            apply_rlimit(libc::RLIMIT_NOFILE, 256)?;
            apply_seccomp_filter()?;
            Ok(())
        });
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn apply_rlimit(resource: libc::__rlimit_resource_t, limit: u64) -> io::Result<()> {
    let rlimit = libc::rlimit {
        rlim_cur: limit as libc::rlim_t,
        rlim_max: limit as libc::rlim_t,
    };

    let result = unsafe { libc::setrlimit(resource, &rlimit) };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn apply_seccomp_filter() -> io::Result<()> {
    const BPF_LD: u16 = 0x00;
    const BPF_W: u16 = 0x00;
    const BPF_ABS: u16 = 0x20;
    const BPF_JMP: u16 = 0x05;
    const BPF_JEQ: u16 = 0x10;
    const BPF_K: u16 = 0x00;
    const BPF_RET: u16 = 0x06;
    const SECCOMP_RET_ALLOW: u32 = 0x7fff_0000;
    const SECCOMP_RET_ERRNO: u32 = 0x0005_0000;
    const SECCOMP_SET_MODE_FILTER: libc::c_long = 1;
    const AUDIT_ARCH_X86_64: u32 = 0xc000_003e;
    const EPERM_U32: u32 = libc::EPERM as u32;

    fn stmt(code: u16, k: u32) -> libc::sock_filter {
        libc::sock_filter { code, jt: 0, jf: 0, k }
    }

    fn jump_eq(k: u32, jt: u8, jf: u8) -> libc::sock_filter {
        libc::sock_filter {
            code: BPF_JMP | BPF_JEQ | BPF_K,
            jt,
            jf,
            k,
        }
    }

    let denied_syscalls = [
        libc::SYS_bpf as u32,
        libc::SYS_delete_module as u32,
        libc::SYS_finit_module as u32,
        libc::SYS_fsconfig as u32,
        libc::SYS_fsmount as u32,
        libc::SYS_fsopen as u32,
        libc::SYS_fspick as u32,
        libc::SYS_init_module as u32,
        libc::SYS_kexec_load as u32,
        libc::SYS_mount as u32,
        libc::SYS_move_mount as u32,
        libc::SYS_open_by_handle_at as u32,
        libc::SYS_open_tree as u32,
        libc::SYS_perf_event_open as u32,
        libc::SYS_pivot_root as u32,
        libc::SYS_ptrace as u32,
        libc::SYS_reboot as u32,
        libc::SYS_setns as u32,
        libc::SYS_swapoff as u32,
        libc::SYS_swapon as u32,
        libc::SYS_umount2 as u32,
        libc::SYS_unshare as u32,
    ];

    let mut filter = Vec::with_capacity(denied_syscalls.len() * 2 + 5);
    filter.push(stmt(BPF_LD | BPF_W | BPF_ABS, 4));
    filter.push(jump_eq(AUDIT_ARCH_X86_64, 1, 0));
    filter.push(stmt(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM_U32));
    filter.push(stmt(BPF_LD | BPF_W | BPF_ABS, 0));

    for syscall in denied_syscalls {
        filter.push(jump_eq(syscall, 0, 1));
        filter.push(stmt(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM_U32));
    }

    filter.push(stmt(BPF_RET | BPF_K, SECCOMP_RET_ALLOW));

    let program = libc::sock_fprog {
        len: filter.len() as u16,
        filter: filter.as_mut_ptr(),
    };

    let no_new_privs = unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) };
    if no_new_privs != 0 {
        return Err(io::Error::last_os_error());
    }

    let result = unsafe {
        libc::syscall(
            libc::SYS_seccomp,
            SECCOMP_SET_MODE_FILTER,
            0,
            &program as *const libc::sock_fprog,
        )
    };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(target_os = "linux")]
struct CgroupHandle {
    path: PathBuf,
}

#[cfg(target_os = "linux")]
impl Drop for CgroupHandle {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[cfg(target_os = "linux")]
fn maybe_attach_cgroup(pid: u32, max_memory_bytes: u64, max_cpu: u32) -> Option<CgroupHandle> {
    let root = Path::new("/sys/fs/cgroup");
    if !root.join("cgroup.controllers").exists() {
        return None;
    }

    let path = root.join(format!("senclaw-sandbox-{pid}"));
    if fs::create_dir(&path).is_err() {
        return None;
    }

    let period = 100_000_u64;
    let quota = ((u64::from(max_cpu.max(1)) * period) + 99) / 100;
    let write_result = (|| -> io::Result<()> {
        fs::write(path.join("pids.max"), "32")?;
        fs::write(path.join("memory.max"), max_memory_bytes.to_string())?;
        fs::write(path.join("cpu.max"), format!("{quota} {period}"))?;
        fs::write(path.join("cgroup.procs"), pid.to_string())?;
        Ok(())
    })();

    if write_result.is_ok() {
        Some(CgroupHandle { path })
    } else {
        let _ = fs::remove_dir_all(&path);
        None
    }
}

#[cfg(target_os = "linux")]
fn read_process_cpu_time_ms(pid: u32) -> Result<Option<u64>, RunnerError> {
    let stat = match fs::read_to_string(format!("/proc/{pid}/stat")) {
        Ok(stat) => stat,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(RunnerError::Io(error)),
    };

    let process_name_end = match stat.rfind(')') {
        Some(index) => index,
        None => return Ok(None),
    };

    let fields: Vec<&str> = stat[process_name_end + 2..].split_whitespace().collect();
    if fields.len() <= 12 {
        return Ok(None);
    }

    let user_ticks = match fields[11].parse::<u64>() {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    let system_ticks = match fields[12].parse::<u64>() {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    let ticks_per_second = unsafe { libc::sysconf(libc::_SC_CLK_TCK) };
    if ticks_per_second <= 0 {
        return Ok(None);
    }

    Ok(Some(((user_ticks + system_ticks) * 1000) / ticks_per_second as u64))
}
#[cfg(windows)]
fn read_process_cpu_time_ms(pid: u32) -> Result<Option<u64>, RunnerError> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe fn filetime_to_u64(value: FILETIME) -> u64 {
        ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
    }

    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return Ok(None);
    }

    let mut creation_time = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut exit_time = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut kernel_time = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut user_time = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let result = unsafe {
        GetProcessTimes(
            handle,
            &mut creation_time,
            &mut exit_time,
            &mut kernel_time,
            &mut user_time,
        )
    };
    unsafe {
        CloseHandle(handle);
    }
    if result == 0 {
        return Ok(None);
    }

    let cpu_time_100ns = unsafe { filetime_to_u64(kernel_time) + filetime_to_u64(user_time) };
    Ok(Some(cpu_time_100ns / 10_000))
}
#[cfg(not(any(target_os = "linux", windows)))]
fn read_process_cpu_time_ms(_pid: u32) -> Result<Option<u64>, RunnerError> {
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::{cpu_time_limit_seconds, parse_worker_message, SandboxResponse};

    #[test]
    fn cpu_time_budget_rounds_up_to_at_least_one_second() {
        assert_eq!(cpu_time_limit_seconds(250, 10), 1);
        assert_eq!(cpu_time_limit_seconds(5_000, 50), 3);
    }

    #[test]
    fn parses_last_non_empty_worker_message() {
        let message = parse_worker_message("\n{\"type\":\"result\",\"result\":\"ok\"}\n")
            .expect("message should parse")
            .expect("message should exist");
        assert_eq!(message.message_type, "result");
        assert_eq!(message.result.as_deref(), Some("ok"));
    }

    #[test]
    fn sandbox_response_failure_has_expected_shape() {
        let response = SandboxResponse::failure("boom");
        assert!(!response.ok);
        assert_eq!(response.result, None);
        assert_eq!(response.error.as_deref(), Some("boom"));
    }
}


