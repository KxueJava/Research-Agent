package org.wwz.ai.application.agent.file;
/** Authenticated file service callback: scope is not a current session/run. */
public class UnmappedFileScopeException extends RuntimeException {
    public UnmappedFileScopeException() {super("Storage scope is not a conversation");}
}
