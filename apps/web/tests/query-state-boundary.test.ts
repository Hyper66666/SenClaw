import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryStateBoundary } from "../src/components/QueryStateBoundary";

describe("QueryStateBoundary", () => {
  it("renders a loading spinner while a query is pending", () => {
    const html = renderToStaticMarkup(
      React.createElement(QueryStateBoundary, {
        isLoading: true,
        locale: "en",
      }),
    );

    expect(html).toContain("Loading");
  });

  it("renders a translated error state when the query fails", () => {
    const html = renderToStaticMarkup(
      React.createElement(QueryStateBoundary, {
        isLoading: false,
        error: new Error("Boom"),
        locale: "en",
        onRetry: () => undefined,
      }),
    );

    expect(html).toContain("Request failed");
    expect(html).toContain("Boom");
  });

  it("renders children after the query resolves", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        QueryStateBoundary,
        {
          isLoading: false,
          locale: "en",
        },
        React.createElement("div", undefined, "ready"),
      ),
    );

    expect(html).toContain("ready");
  });
});
