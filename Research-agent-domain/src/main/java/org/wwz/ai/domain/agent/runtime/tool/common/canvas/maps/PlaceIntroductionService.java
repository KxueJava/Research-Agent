package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;

/** Owned, bounded text streams. No Surface writes, route changes or main-chat Agent runs. */
public final class PlaceIntroductionService {
    private record Key(String session,String owner,String surface,String node,String place,long revision,String model){}
    private static final class Entry {Flux<String> stream;final StringBuilder text=new StringBuilder();final AtomicBoolean started=new AtomicBoolean();volatile boolean complete;volatile long expires;}
    private final MapService maps;private final PlaceIntroductionGenerator generator;private final Duration timeout;
    private final Map<Key,Entry> cache=new LinkedHashMap<>();private final Map<String,long[]> budgets=new HashMap<>();
    private final Semaphore slots=new Semaphore(4);
    public PlaceIntroductionService(MapService maps,PlaceIntroductionGenerator generator,Duration timeout){if(timeout.isNegative()||timeout.isZero()||timeout.compareTo(Duration.ofSeconds(180))>0)throw new IllegalArgumentException("Invalid introduction timeout");this.maps=maps;this.generator=generator;this.timeout=timeout;}

    public Flux<Map<String,Object>> open(String session,String owner,String surface,String node,String place,long revision,String generation){
        return open(session,owner,surface,node,place,revision,generation,null);
    }
    public Flux<Map<String,Object>> open(String session,String owner,String surface,String node,String place,long revision,String generation,String model){
        String modelRef=model==null?"":model.trim();if(modelRef.length()>128)throw new IllegalArgumentException("Invalid model reference");
        MapData.id(generation);if(revision<1)throw new IllegalArgumentException("Invalid map revision");
        // Check ownership, membership and current revision even for a completed cache hit.
        var snapshot=maps.readDetails(session,owner,surface,node,place);
        if(MapData.number(snapshot.get("mapRevision"))!=revision)throw new IllegalStateException("Map revision changed");
        var key=new Key(session,owner,surface,node,place,revision,modelRef);Entry entry;boolean cached;
        synchronized(cache){
            long now=System.currentTimeMillis();cache.entrySet().removeIf(e->e.getValue().complete&&e.getValue().expires<now);
            entry=cache.get(key);
            if(entry==null){budget(owner);if(cache.size()>=128){var victim=cache.entrySet().stream().filter(e->e.getValue().complete).findFirst();if(victim.isEmpty())throw new MapProviderException("MAP_INTRO_BUSY","简介生成繁忙，请稍后重试");cache.remove(victim.get().getKey());}
                var details=new LinkedHashMap<>(MapData.object(snapshot.get("details")));details.put("introductionModelRef",modelRef);
                entry=create(key,details);cache.put(key,entry);}
            cached=entry.complete;
        }
        Entry selected=entry;boolean fromCache=cached;
        return Flux.defer(()->{var sequence=new AtomicInteger();Flux<String> chunks=fromCache?Flux.just(selected.text.toString()):selected.stream;return Flux.concat(
            Flux.just(frame(generation,place,revision,sequence.getAndIncrement(),"start","",fromCache)),
            chunks.map(text->frame(generation,place,revision,sequence.getAndIncrement(),"delta",text,fromCache)),
            Flux.defer(()->Flux.just(frame(generation,place,revision,sequence.getAndIncrement(),"complete","",fromCache)))
        ).onErrorResume(error->Flux.just(frame(generation,place,revision,sequence.getAndIncrement(),"error","AI 简介生成失败，请重试。",false)));});
    }
    private Entry create(Key key,Map<String,Object> details){
        var entry=new Entry();entry.expires=System.currentTimeMillis()+timeout.toMillis();
        entry.stream=Flux.defer(()->{
            if(!entry.started.compareAndSet(false,true))return Flux.<String>error(new IllegalStateException("Generation was cancelled"));
            if(!slots.tryAcquire())return Flux.<String>error(new IllegalStateException("Generation capacity reached"));
            var count=new AtomicInteger();
            return Flux.defer(()->generator.generate(details)).filter(text->text!=null&&!text.isEmpty())
                .handle((String text,reactor.core.publisher.SynchronousSink<String> sink)->{
                    if(entry.text.length()+text.length()>5000||count.incrementAndGet()>2000){sink.error(new IllegalArgumentException("Introduction too large"));return;}
                    entry.text.append(text);sink.next(text);
                })
                .switchIfEmpty(Flux.error(new IllegalStateException("Model returned no introduction")))
                .takeUntilOther(Mono.delay(timeout).flatMap(value->Mono.error(new IllegalStateException("Introduction timeout"))))
                .doOnComplete(()->{if(entry.text.toString().isBlank())throw new IllegalStateException("Empty introduction");entry.expires=System.currentTimeMillis()+Duration.ofMinutes(30).toMillis();entry.complete=true;})
                .doFinally(signal->{slots.release();if(!entry.complete)synchronized(cache){cache.remove(key,entry);}});
        }).doOnError(error->{synchronized(cache){cache.remove(key,entry);}}).subscribeOn(Schedulers.boundedElastic()).replay().refCount(1);
        return entry;
    }
    private void budget(String owner){
        long minute=System.currentTimeMillis()/60000;
        budgets.entrySet().removeIf(e->e.getValue()[0]!=minute);
        if(!budgets.containsKey(owner)&&budgets.size()>=1000)throw new MapProviderException("MAP_INTRO_BUSY","简介生成繁忙，请稍后重试");
        var budget=budgets.computeIfAbsent(owner,k->new long[]{minute,0});if(++budget[1]>12)throw new MapProviderException("MAP_RATE_LIMIT","简介生成过于频繁，请稍后重试");
    }
    private static Map<String,Object> frame(String generation,String place,long revision,int sequence,String type,String text,boolean cached){
        return Map.of("generationId",generation,"placeId",place,"mapRevision",revision,"sequence",sequence,"type",type,"text",text,"cached",cached,"emittedAt",Instant.now().toString());
    }
}
