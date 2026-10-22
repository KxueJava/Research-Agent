package org.wwz.ai.infrastructure.maps;

import com.alibaba.fastjson.JSON;
import org.wwz.ai.domain.agent.adapter.port.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Fixed HTTPS destinations only; server Web-service key never leaves this adapter. */
public final class AmapProvider implements PlacesProvider, RouteProvider {
    private final RemoteHttpPort http;
    private final String key;
    private final Map<String,MapData.Place> geocoded=Collections.synchronizedMap(new LinkedHashMap<>());
    public AmapProvider(RemoteHttpPort http,String key){this.http=http;this.key=Objects.toString(key,"");}
    public boolean configured(){return !key.isBlank();}
    @Override public List<MapData.Place> search(String query,String city,int limit){
        input(query,120);if(city!=null&&city.length()>80)throw new IllegalArgumentException("City too long");
        if(limit<1||limit>10)throw new IllegalArgumentException("Search limit must be 1–10");
        var result=get("/v3/place/text",Map.of("keywords",query,"city",Objects.toString(city,""),"offset",String.valueOf(limit),"extensions","all"));
        return array(result.get("pois")).stream().limit(limit).map(AmapProvider::poi).toList();
    }
    @Override public MapData.Place resolve(String id){
        return details(id).place();
    }
    @Override public PlaceDetails details(String id){
        MapData.id(id);
        if(id.startsWith("geo-")){var value=geocoded.get(id);if(value==null)throw new MapProviderException("PLACE_EXPIRED","地址定位已过期，请重新地理编码或选择 POI");return PlaceDetails.basic(value);}
        if(!id.matches("[A-Za-z0-9_-]{1,128}"))throw new IllegalArgumentException("Invalid provider place ID");
        var result=get("/v3/place/detail",Map.of("id",id,"extensions","all"));
        var pois=array(result.get("pois"));if(pois.size()!=1)throw new MapProviderException("PLACE_UNAVAILABLE","地点不存在或服务地区不可用");
        var p=poi(pois.getFirst());if(!p.placeId().equals(id))throw new MapProviderException("INVALID_PROVIDER_DATA","地点标识与供应商响应不符");
        var raw=MapData.object(pois.getFirst());var biz=raw.get("biz_ext") instanceof Map<?,?> b?b:Map.of();
        String type=text(raw.get("type"));String category=type.isBlank()?"":type.substring(type.lastIndexOf(';')+1);
        String intro=text(raw.get("description"));if(intro.isBlank())intro=text(raw.get("intro"));boolean synthesized=intro.isBlank();
        if(synthesized){String region=text(raw.get("pname"))+text(raw.get("cityname"))+text(raw.get("adname"));String address=p.address();if(!region.isBlank()&&!address.startsWith(region))address=region+address;
            intro=p.name()+(address.isBlank()?"": "位于"+address)+"。"+(category.isBlank()?"":"地点分类为"+category+"。");}
        String hours=text(biz.get("opentime"));if(hours.isBlank())hours=text(raw.get("opentime"));
        Double rating=null;try{double r=Double.parseDouble(text(biz.get("rating")));if(Double.isFinite(r)&&r>0&&r<=5)rating=r;}catch(NumberFormatException ignored){}
        return new PlaceDetails(p,photos(raw.get("photos")),category,intro.substring(0,Math.min(intro.length(),6000)),text(raw.get("tel")),website(text(raw.get("website"))),hours,rating,synthesized);
    }
    @Override public List<MapData.Place> geocode(String address,String city){
        input(address,200);
        var result=get("/v3/geocode/geo",Map.of("address",address,"city",Objects.toString(city,"")));
        List<MapData.Place> out=new ArrayList<>();
        for(Object raw:array(result.get("geocodes"))){var g=MapData.object(raw);var c=coordinates(text(g.get("location")));String formatted=text(g.get("formatted_address"));
            String id="geo-"+org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiActionService.digest(List.of(formatted,c));
            var p=new MapData.Place(id,formatted,c.get(0),c.get(1),formatted,"amap",null);
            synchronized(geocoded){if(geocoded.size()>=500)geocoded.remove(geocoded.keySet().iterator().next());geocoded.put(id,p);}out.add(p);if(out.size()>=10)break;
        }return out;
    }
    @Override public MapData.Leg route(MapData.Place from,MapData.Place to,String mode){
        MapData.mode(mode);
        var response=get("/v3/direction/"+mode,Map.of("origin",location(from),"destination",location(to),"extensions","base"));
        var route=MapData.object(response.get("route"));var paths=array(route.get("paths"));
        if(paths.isEmpty())throw new MapProviderException("ROUTE_UNREACHABLE","这些地点之间没有可用路线，请调整地点或交通方式");
        var path=MapData.object(paths.getFirst());List<List<Double>> geometry=new ArrayList<>();
        for(Object rawStep:array(path.get("steps"))){var step=MapData.object(rawStep);String line=text(step.get("polyline"));
            for(String part:line.split(";")){if(part.isBlank())continue;var point=coordinates(part);if(geometry.isEmpty()||!geometry.getLast().equals(point))geometry.add(point);if(geometry.size()>2000)throw new MapProviderException("ROUTE_TOO_LARGE","路线几何过大，请缩短行程");}}
        if(geometry.size()<2)throw new MapProviderException("ROUTE_GEOMETRY_MISSING","服务未返回完整道路路线，请重试");
        try{return new MapData.Leg(from.placeId(),to.placeId(),Long.parseLong(text(path.get("distance"))),Long.parseLong(text(path.get("duration"))),geometry);}
        catch(IllegalArgumentException error){throw new MapProviderException("INVALID_PROVIDER_DATA","路线服务返回了无效数据");}
    }
    private Map<String,Object> get(String path,Map<String,String> args){
        if(key.isBlank())throw new MapProviderException("MAP_NOT_CONFIGURED","高德 Web 服务 Key 尚未配置");
        var params=new TreeMap<>(args);params.put("key",key);params.put("output","JSON");
        String query=params.entrySet().stream().map(e->encode(e.getKey())+"="+encode(e.getValue())).collect(java.util.stream.Collectors.joining("&"));
        Map<String,Object> result;
        try{String raw=http.execute(RemoteHttpRequest.builder().method("GET").url("https://restapi.amap.com"+path+"?"+query).followRedirects(false).connectTimeoutSeconds(5L).readTimeoutSeconds(15L).callTimeoutSeconds(20L).build());
            if(raw==null||raw.length()>2_097_152)throw new IllegalArgumentException();result=JSON.parseObject(raw);if(result==null)throw new IllegalArgumentException();
        }catch(Exception ignored){throw new MapProviderException("MAP_REQUEST_FAILED","地图服务暂时无法连接或响应无效，请稍后重试");}
        if(!"1".equals(String.valueOf(result.get("status")))){
            String code=text(result.get("infocode"));
            if("10009".equals(code))throw new MapProviderException("KEY_PLATFORM_MISMATCH","高德 Key 类型不匹配，需要 Web 服务 Key");
            if(Set.of("10003","10004","10010","10019","10020","10021","10044").contains(code))throw new MapProviderException("MAP_QUOTA_LIMIT","高德请求配额或频率受限，请稍后重试");
            if(Set.of("10001","10002","10005","10006","10007","10008","10012","10013").contains(code))throw new MapProviderException("MAP_PERMISSION_DENIED","高德密钥、白名单或服务权限未通过验证");
            throw new MapProviderException("MAP_SERVICE_REJECTED","高德服务未能完成请求，请检查地点及服务权限");
        }return result;
    }
    private static MapData.Place poi(Object raw){try{var p=MapData.object(raw);var c=coordinates(text(p.get("location")));return new MapData.Place(text(p.get("id")),text(p.get("name")),c.get(0),c.get(1),text(p.get("address")),"amap",photo(p.get("photos")));}catch(IllegalArgumentException e){throw new MapProviderException("INVALID_PROVIDER_DATA","地点服务返回了无效坐标或标识");}}
    private static String photo(Object raw){
        var all=photos(raw);return all.isEmpty()?null:all.getFirst();
    }
    private static List<String> photos(Object raw){
        Set<String> result=new LinkedHashSet<>();
        for(Object item:array(raw)){
            if(!(item instanceof Map<?,?> p)||!(p.get("url") instanceof String url)||url.length()>4096)continue;
            try{var uri=java.net.URI.create(url.trim());String host=uri.getHost();if(host==null||uri.getRawUserInfo()!=null)continue;
                if("http".equalsIgnoreCase(uri.getScheme())&&(host.equals("autonavi.com")||host.endsWith(".autonavi.com")||host.equals("amap.com")||host.endsWith(".amap.com")))uri=java.net.URI.create("https"+uri.toString().substring(4));
                if("https".equalsIgnoreCase(uri.getScheme())&&(uri.getPort()==-1||uri.getPort()==443)){result.add(uri.toASCIIString());if(result.size()>=8)break;}
            }catch(Exception ignored){/* A missing or malformed photo must not invalidate a valid POI. */}
        }return List.copyOf(result);
    }
    private static String website(String raw){if(raw.isBlank()||raw.length()>2048)return null;try{var uri=java.net.URI.create(raw);return Set.of("https","http").contains(Objects.toString(uri.getScheme(),""))&&uri.getHost()!=null&&uri.getRawUserInfo()==null?uri.toASCIIString():null;}catch(Exception ignored){return null;}}
    private static String text(Object value){return value instanceof String s?s:value instanceof Number n?n.toString():"";}
    private static List<?> array(Object value){return value instanceof List<?> l?l:List.of();}
    private static List<Double> coordinates(String raw){try{String[] pair=raw.split(",");if(pair.length!=2)throw new IllegalArgumentException();return MapData.coordinate(List.of(Double.valueOf(pair[0]),Double.valueOf(pair[1])));}catch(Exception e){throw new MapProviderException("INVALID_PROVIDER_DATA","地图服务返回了无效经纬度");}}
    private static String location(MapData.Place p){return p.longitude()+","+p.latitude();}
    private static String encode(String raw){return URLEncoder.encode(raw,StandardCharsets.UTF_8);}
    private static void input(String value,int max){if(value==null||value.isBlank()||value.length()>max)throw new IllegalArgumentException("Invalid place query");}
}
