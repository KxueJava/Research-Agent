package org.wwz.ai.infrastructure.tooloutput;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import javax.sql.DataSource;

/** Also migrate when protocol writes are disabled, so session deletion remains valid. */
@Component
@Profile("!test")
public class UiSurfaceSchema {
    public UiSurfaceSchema(@Qualifier("mysqlDataSource") DataSource source) {
        JdbcUiSurfaceStore.ensureSchema(source);
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(source);
        Integer table=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='ai_agent_tool_output_canvas_publish'",Integer.class);
        if(table!=null&&table>0) {
            Integer column=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ai_agent_tool_output_canvas_publish' AND column_name='surface_json'",Integer.class);
            if(column!=null&&column==0) {
                try {jdbc.execute("ALTER TABLE ai_agent_tool_output_canvas_publish ADD COLUMN surface_json LONGTEXT NULL");}
                catch(org.springframework.dao.DataAccessException concurrentMigration) {
                    Integer added=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ai_agent_tool_output_canvas_publish' AND column_name='surface_json'",Integer.class);
                    if(added==null||added==0)throw concurrentMigration;
                }
            }
        }
    }
}
