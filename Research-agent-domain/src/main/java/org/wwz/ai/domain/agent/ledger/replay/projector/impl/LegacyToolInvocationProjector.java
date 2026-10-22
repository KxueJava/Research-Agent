package org.wwz.ai.domain.agent.ledger.replay.projector.impl;

import com.alibaba.fastjson.JSON;
import org.wwz.ai.domain.agent.ledger.model.ArtifactView;
import org.wwz.ai.domain.agent.ledger.model.ToolInvocationView;
import org.wwz.ai.domain.agent.ledger.model.replay.ProjectedReplayEvent;
import org.wwz.ai.domain.agent.ledger.model.tooloutput.FileToolOutput;
import org.wwz.ai.domain.agent.ledger.model.tooloutput.PlanningToolOutput;
import org.wwz.ai.domain.agent.research.model.multi.EventResult;
import org.wwz.ai.domain.agent.runtime.dto.Plan;
import java.util.*;

/** Read-only compatibility for removed tools; never reinstates their execution paths. */
public class LegacyToolInvocationProjector extends AbstractToolInvocationProjector {
    @Override public boolean supports(String tool) {return "planning".equals(tool)||"file_tool".equals(tool);}
    @Override public List<ProjectedReplayEvent> project(ToolInvocationView invocation,List<ArtifactView> artifacts,EventResult state) {
        if("file_tool".equals(invocation.getToolName())) {
            FileToolOutput output=invocation.getStructuredOutput() instanceof FileToolOutput file?file:null;
            Map<String,Object> body=new LinkedHashMap<>();
            body.put("command",output!=null&&"get".equals(output.getCommand())?"读取文件":Objects.toString(output==null?null:output.getCommand(),"文件"));
            body.put("fileInfo",mergeFileRefs(output==null?List.of():output.getFileRefs(),artifacts));
            return List.of(buildTaskEvent(state,invocation,"file",buildStructuredToolResponse(invocation,"file",body),buildArtifactRefs(artifacts)));
        }
        Plan plan;
        PlanningToolOutput output=invocation.getStructuredOutput() instanceof PlanningToolOutput p?p:null;
        if(output!=null&&output.getAfterPlan()!=null)plan=output.getAfterPlan().copy();
        else {
            Object saved=state.getResultMap().get("legacyPlanSnapshot");
            plan=saved instanceof Plan p?p.copy():Plan.empty();
            Map<String,Object> input=readMap(invocation.getInputJson());
            String command=Objects.toString(input.get("command"),"");
            if("create".equals(command)||"update".equals(command)) {
                List<String> steps=input.get("steps") instanceof List<?> list?list.stream().map(String::valueOf).toList():null;
                if("create".equals(command))plan=Plan.create(Objects.toString(input.get("title"),""),steps==null?List.of():steps);
                else plan.update((String)input.get("title"),steps);
            } else if("mark_step".equals(command)&&input.get("step_index") instanceof Number n
                    && n.intValue()>=0&&n.intValue()<plan.getSteps().size()) {
                plan.updateStepStatus(n.intValue(),Objects.toString(input.get("step_status"),"completed"),(String)input.get("note"));
            }
            if(plan.getCurrentStepIndex()==null&&!plan.getSteps().isEmpty())plan.stepPlan();
        }
        state.getResultMap().put("legacyPlanSnapshot",plan.copy());
        String round=Objects.toString(invocation.getId(),invocation.getToolCallId());
        state.setPlannerRoundId(round);
        Map<String,Object> body=new LinkedHashMap<>((Map<String,Object>)JSON.toJSON(plan));
        body.put("plannerRoundId",round);
        List<ProjectedReplayEvent> events=new ArrayList<>();
        events.add(event(state,invocation,"plan",body));
        String current=output!=null?output.getCurrentStep():plan.getCurrentStep();
        if(!Boolean.TRUE.equals(output==null?false:output.getAutoFinished())&&current!=null&&!current.isBlank()) {
            state.renewTaskId();
            Map<String,Object> step=new LinkedHashMap<>();step.put("messageType","task");
            step.put("task",current.replaceFirst("^执行顺序\\s*\\d+[.、：:]?\\s*", ""));step.put("plannerRoundId",round);
            events.add(event(state,invocation,"task",step));
        }
        return events;
    }
    private ProjectedReplayEvent event(EventResult state,ToolInvocationView invocation,String type,Map<String,Object> body) {
        return ProjectedReplayEvent.builder().taskId(state.getTaskId()).taskOrder(state.getTaskOrder().getAndIncrement())
                .messageId(resolveMessageId(invocation,type)).messageType(type)
                .messageOrder(state.getAndIncrOrder(state.getTaskId()+":"+type)).resultMap(body).build();
    }
}
