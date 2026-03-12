use sandbox_runner::{read_request_from_stdin, run_request, write_response_to_stdout, SandboxResponse};

fn main() {
    let response = match read_request_from_stdin().and_then(run_request) {
        Ok(response) => response,
        Err(error) => SandboxResponse::failure(error.to_string()),
    };

    if let Err(error) = write_response_to_stdout(&response) {
        eprintln!("{error}");
        std::process::exit(1);
    }

    if !response.ok {
        if let Some(message) = response.error.as_deref() {
            eprintln!("{message}");
        }
        std::process::exit(1);
    }
}