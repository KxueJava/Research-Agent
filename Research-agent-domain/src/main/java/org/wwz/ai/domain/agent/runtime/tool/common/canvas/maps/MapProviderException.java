package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;
/** Public error text never includes upstream URLs, response bodies or credentials. */
public final class MapProviderException extends RuntimeException {
    private final String code;
    public MapProviderException(String code,String message){super(message);this.code=code;}
    public String code(){return code;}
}
