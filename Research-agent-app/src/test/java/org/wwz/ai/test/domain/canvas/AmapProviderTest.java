package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import org.wwz.ai.infrastructure.maps.AmapProvider;
import org.wwz.ai.domain.agent.adapter.port.RemoteHttpPort;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import java.util.*;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class AmapProviderTest {
    @Test public void exposesOnlyActualDetailsAndKeepsMissingOpeningHoursUnknown()throws Exception{
        RemoteHttpPort http=mock(RemoteHttpPort.class);var provider=new AmapProvider(http,"test-key");
        when(http.execute(any())).thenReturn("""
            {"status":"1","pois":[{"id":"P1","name":"Park","location":"118.1,24.4","address":"Road","type":"景点;公园","description":"供应商提供的真实介绍","tel":"1234567","website":"https://example.com/park","photos":[{"url":"https://store.is.autonavi.com/one.jpg"},{"url":"https://store.is.autonavi.com/two.jpg"}],"biz_ext":{"rating":"4.5","opentime":"09:00–17:00"}}]}
            """);
        var detail=provider.details("P1");assertEquals(2,detail.photos().size());assertEquals("公园",detail.category());assertEquals("供应商提供的真实介绍",detail.introduction());assertFalse(detail.synthesized());assertEquals(4.5,detail.rating(),0);assertEquals("09:00–17:00",detail.openingHours());
        when(http.execute(any())).thenReturn("{\"status\":\"1\",\"pois\":[{\"id\":\"P1\",\"name\":\"Park\",\"location\":\"118.1,24.4\",\"address\":\"Road\",\"website\":\"javascript:bad\"}]}");
        detail=provider.details("P1");assertTrue(detail.synthesized());assertTrue(detail.introduction().contains("Road"));assertNull(detail.rating());assertNull(detail.website());assertFalse(detail.toMap().containsKey("openingHours"));
    }
    @Test public void requestsAndPreservesActualPoiPhotosIncludingLegacyHttpAutonaviUrls()throws Exception{
        RemoteHttpPort http=mock(RemoteHttpPort.class);
        when(http.execute(any())).thenReturn("{\"status\":\"1\",\"pois\":[{\"id\":\"P1\",\"name\":\"Park\",\"location\":\"118.1,24.4\",\"address\":\"Road\",\"photos\":[{\"url\":\"javascript:bad\"},{\"url\":\"http://store.is.autonavi.com/showpic/real-park.jpg\"}]}]}");
        var provider=new AmapProvider(http,"server-test-key");
        assertEquals("https://store.is.autonavi.com/showpic/real-park.jpg",provider.search("park","city",1).getFirst().photoUrl());
        assertEquals("https://store.is.autonavi.com/showpic/real-park.jpg",provider.resolve("P1").photoUrl());
        verify(http,atLeast(2)).execute(argThat(r->r.getUrl().contains("extensions=all")));
    }
    @Test public void absentOrUnsafePhotosDoNotBreakOtherwiseValidPlaces()throws Exception{
        RemoteHttpPort http=mock(RemoteHttpPort.class);var provider=new AmapProvider(http,"test-key");
        for(String photo:List.of("[]","[{\"url\":\"data:image/png;base64,abc\"}]","[{\"url\":\"http://untrusted.example/a.jpg\"}]","[{\"url\":\"https://user:secret@example.com/a.jpg\"}]")){
            when(http.execute(any())).thenReturn("{\"status\":\"1\",\"pois\":[{\"id\":\"P1\",\"name\":\"Park\",\"location\":\"118.1,24.4\",\"address\":[],\"photos\":"+photo+"}]}");
            assertNull(provider.search("park","",1).getFirst().photoUrl());
        }
    }
    @Test public void normalizesPoiAndActualRoadGeometryWithoutUsingStraightLineEstimates()throws Exception{
        RemoteHttpPort http=mock(RemoteHttpPort.class);
        when(http.execute(any())).thenReturn("{\"status\":\"1\",\"pois\":[{\"id\":\"P1\",\"name\":\"Park\",\"location\":\"118.1,24.4\",\"address\":\"Road\"}]}");
        var provider=new AmapProvider(http,"server-test-key");var p=provider.search("park","city",2).getFirst();assertEquals(List.of(118.1,24.4),p.coordinates());
        when(http.execute(any())).thenReturn("{\"status\":\"1\",\"route\":{\"paths\":[{\"distance\":\"900\",\"duration\":\"600\",\"steps\":[{\"polyline\":\"118.1,24.4;118.11,24.405;118.12,24.41\"}]}]}}");
        var leg=provider.route(p,new MapData.Place("P2","End",118.12,24.41,"Road","amap",null),"walking");
        assertEquals(900,leg.distanceMeters());assertEquals(600,leg.durationSeconds());assertEquals(3,leg.geometry().size());
        verify(http,atLeastOnce()).execute(argThat(r->r.getUrl().startsWith("https://restapi.amap.com/")&&Boolean.FALSE.equals(r.getFollowRedirects())));
    }
    @Test public void reportsPermissionAndMissingGeometryWithoutLeakingCredentials()throws Exception{
        RemoteHttpPort http=mock(RemoteHttpPort.class);var provider=new AmapProvider(http,"server-test-key");
        when(http.execute(any())).thenReturn("{\"status\":\"0\",\"infocode\":\"10009\",\"info\":\"server-test-key\"}");
        var denied=assertThrows(MapProviderException.class,()->provider.search("park","",1));assertEquals("KEY_PLATFORM_MISMATCH",denied.code());assertFalse(denied.getMessage().contains("server-test-key"));
        when(http.execute(any())).thenThrow(new java.io.IOException("upstream key=server-test-key"));
        var network=assertThrows(MapProviderException.class,()->provider.search("park","",1));assertNull(network.getCause());assertFalse(network.getMessage().contains("server-test-key"));
        assertThrows(MapProviderException.class,()->new AmapProvider(http,"").search("park","",1));
        doReturn("{\"status\":\"1\",\"route\":{\"paths\":[{\"distance\":\"9\",\"duration\":\"6\",\"steps\":[]}]}}").when(http).execute(any());
        var p=new MapData.Place("a","A",118,24,"","amap",null);assertThrows(MapProviderException.class,()->provider.route(p,new MapData.Place("b","B",119,25,"","amap",null),"walking"));
    }
}
