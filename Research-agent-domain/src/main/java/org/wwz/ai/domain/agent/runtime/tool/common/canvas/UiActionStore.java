package org.wwz.ai.domain.agent.runtime.tool.common.canvas;
import java.util.List;
import java.util.function.UnaryOperator;
public interface UiActionStore {
  UiActionExecution create(UiActionExecution execution);
  UiActionExecution read(String session,String owner,String id);
  List<UiActionExecution> list(String session,String owner,String surface);
  /** Serializes with deletion and Surface writes. Surface work inside op must join this transaction. */
  UiActionExecution update(String session,String owner,String id,UnaryOperator<UiActionExecution> op);
}
