package org.wwz.ai.test.domain.canvas;

import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import org.wwz.ai.application.agent.visitor.*;
import org.wwz.ai.trigger.http.agent.AgentMapIntroductionController;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.http.MediaType;

public class PlaceIntroductionServiceTest {
    @Test public void mvcWritesEmitterAsIncrementalSseAndIncludesSelectedModelInCacheIdentity()throws Exception{
        var service=new PlaceIntroductionService(maps(),details->Flux.just("模型："+details.get("introductionModelRef")),Duration.ofSeconds(5));
        var ownership=mock(ConversationSessionOwnershipApplicationService.class);
        var mvc=MockMvcBuilders.standaloneSetup(new AgentMapIntroductionController(service,ownership)).build();
        VisitorRequestContext.bind("o");try{
            var pending=mvc.perform(post("/api/agent/conversation/sessions/s/maps/surface/map/places/p/introduction")
                .contentType(MediaType.APPLICATION_JSON).content("{\"mapRevision\":1,\"generationId\":\"mvc\",\"model\":\"chosen\"}"))
                .andExpect(request().asyncStarted()).andReturn();
            pending.getAsyncResult(3000);
            var response=mvc.perform(asyncDispatch(pending)).andExpect(status().isOk()).andReturn().getResponse();
            assertTrue(response.getContentType().startsWith(MediaType.TEXT_EVENT_STREAM_VALUE));
            String body=response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
            assertTrue(body.contains("event:place_introduction"));assertTrue(body.contains("模型：chosen"));assertTrue(body.contains("\"type\":\"complete\""));
            var other=service.open("s","o","surface","map","p",1,"other","another").collectList().block(Duration.ofSeconds(3));
            assertEquals(false,other.getFirst().get("cached"));assertEquals("模型：another",other.get(1).get("text"));
        }finally{VisitorRequestContext.clear();}
    }
    private MapService maps(){var maps=mock(MapService.class);when(maps.readDetails("s","o","surface","map","p")).thenReturn(Map.of("mapRevision",1L,"details",Map.of("category","公园")));return maps;}
    private void until(java.util.function.BooleanSupplier condition)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(!condition.getAsBoolean()&&System.nanoTime()<end)Thread.sleep(5);assertTrue(condition.getAsBoolean());}
    @Test public void firstChunkIsAvailableBeforeCompletionAndSharedCancellationReleasesUpstream()throws Exception{
        var maps=maps();var calls=new AtomicInteger();var cancelled=new AtomicInteger();var sink=new AtomicReference<FluxSink<String>>();
        var service=new PlaceIntroductionService(maps,details->Flux.create(s->{calls.incrementAndGet();sink.set(s);s.onCancel(cancelled::incrementAndGet);}),Duration.ofSeconds(5));
        var a=new CopyOnWriteArrayList<Map<String,Object>>();var one=service.open("s","o","surface","map","p",1,"g1").subscribe(a::add);until(()->sink.get()!=null);
        sink.get().next("第一段。");until(()->a.stream().anyMatch(e->e.get("type").equals("delta")));assertFalse(a.stream().anyMatch(e->e.get("type").equals("complete")));
        var b=new CopyOnWriteArrayList<Map<String,Object>>();var two=service.open("s","o","surface","map","p",1,"g2").subscribe(b::add);until(()->b.size()>=2);assertEquals(1,calls.get());assertEquals("第一段。",b.get(1).get("text"));
        one.dispose();assertEquals(0,cancelled.get());two.dispose();until(()->cancelled.get()==1);
        var c=new CopyOnWriteArrayList<Map<String,Object>>();var three=service.open("s","o","surface","map","p",1,"g3").subscribe(c::add);until(()->calls.get()==2);sink.get().next("完整简介。");sink.get().complete();until(()->c.stream().anyMatch(e->e.get("type").equals("complete")));
        var cached=service.open("s","o","surface","map","p",1,"g4").collectList().block(Duration.ofSeconds(2));assertEquals(2,calls.get());assertEquals(true,cached.getFirst().get("cached"));assertEquals("完整简介。",cached.get(1).get("text"));assertEquals(0,cached.getFirst().get("sequence"));three.dispose();
        when(maps.readDetails("s","o","surface","map","p")).thenThrow(new SecurityException());assertThrows(SecurityException.class,()->service.open("s","o","surface","map","p",1,"denied"));
    }
    @Test public void failureAndTimeoutKeepPartialTextButNeverCacheSuccess(){
        var calls=new AtomicInteger();var service=new PlaceIntroductionService(maps(),details->{calls.incrementAndGet();return Flux.just("已生成的部分。").concatWith(Flux.error(new IllegalStateException("secret-provider-key")));},Duration.ofSeconds(2));
        for(int i=0;i<2;i++){var events=service.open("s","o","surface","map","p",1,"g"+i).collectList().block(Duration.ofSeconds(2));assertEquals("delta",events.get(1).get("type"));assertEquals("error",events.getLast().get("type"));assertFalse(events.toString().contains("secret-provider-key"));}assertEquals(2,calls.get());
        var timeout=new PlaceIntroductionService(maps(),details->Flux.just("部分").concatWith(Flux.never()),Duration.ofMillis(50));var events=timeout.open("s","o","surface","map","p",1,"timeout").collectList().block(Duration.ofSeconds(2));assertEquals("error",events.getLast().get("type"));assertFalse(events.stream().anyMatch(e->e.get("type").equals("complete")));
    }
    @Test public void checksVersionAndOwnershipBeforeStartingModel(){
        var generator=mock(PlaceIntroductionGenerator.class);var service=new PlaceIntroductionService(maps(),generator,Duration.ofSeconds(5));assertThrows(IllegalStateException.class,()->service.open("s","o","surface","map","p",2,"g"));verifyNoInteractions(generator);
        var ownership=mock(ConversationSessionOwnershipApplicationService.class);doThrow(new SessionOwnershipDeniedException("denied")).when(ownership).ensureExistingSessionAccessible("foreign","s");var intro=mock(PlaceIntroductionService.class);
        VisitorRequestContext.bind("foreign");try{var response=new AgentMapIntroductionController(intro,ownership).generate("s","surface","map","p",new AgentMapIntroductionController.Request(1,"g"));assertEquals(404,response.getStatusCode().value());verifyNoInteractions(intro);}finally{VisitorRequestContext.clear();}
    }
}
