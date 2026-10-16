package org.wwz.ai.domain.agent.runtime.tool.mcp.runtime;

/** A resource failure with a stable public code; remote exception text is never public data. */
public class McpResourceReadException extends RuntimeException {
    private final String errorCode;

    public McpResourceReadException(String errorCode) {
        super("MCP resource read failed");
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
