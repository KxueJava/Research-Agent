package org.wwz.ai.infrastructure.gateway;

import java.util.LinkedHashMap;
import java.util.Map;

/** Server-only credential. Never attach to model-selected external URLs or expose in tool output. */
public final class FileServiceCredentials {
    private FileServiceCredentials() {}
    public static Map<String,String> headers() {
        Map<String,String> result=new LinkedHashMap<>();result.put("Content-Type","application/json");
        String token=System.getenv("RESEARCH_FILE_SERVICE_TOKEN");
        if(token!=null&&!token.isBlank())result.put("X-Research-File-Service",token);
        return result;
    }
}
