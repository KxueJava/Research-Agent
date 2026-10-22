"""Run Java regression in a new local MySQL schema with a schema-scoped account.

Never copies data or model credentials. Admin credentials only bootstrap/clean up;
the Maven child receives only disposable credentials. Reports remain on failure.
"""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET

import pymysql
import sqlparse
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/intelligent-ui/stage-9'

def main():
    namespace = {'m': 'http://maven.apache.org/POM/4.0.0'}
    pom = ET.parse(ROOT / 'Research-agent-app/pom.xml')
    excluded = {node.text.split('**/')[-1].removesuffix('.java').replace('/', '.')
                for node in pom.findall('.//m:excludes/m:exclude', namespace)}
    selected, deferred = [], []
    test_paths = []
    for module in ROOT.glob('Research-agent-*'):
        test_root = module / 'src/test/java'
        test_paths.extend(test_root.rglob('*Test.java'))
    for path in sorted(test_paths):
        test_root = next(parent for parent in path.parents if parent.name == 'java' and parent.parent.name == 'test')
        name = str(path.relative_to(test_root).with_suffix('')).replace('\\', '.').replace('/', '.')
        source = path.read_text(encoding='utf-8-sig')
        if not re.search(r'@(?:org\.junit\.(?:jupiter\.api\.)?)?Test\b', source):
            deferred.append({'class': name, 'reason': 'Manual example; no JUnit test methods'})
        elif name in excluded:
            deferred.append({'class': name, 'reason': 'Existing external model/service lane'})
        elif re.search(r'\b(SpringBootTest|SpringApplicationBuilder|SpringApplication)\b', source) and path.name not in ('ConfigProfileLoadingTest.java', 'DataSourceConfigProfileTest.java'):
            deferred.append({'class': name, 'reason': 'Spring startup requires separate reviewed context isolation'})
        else:
            if name.rsplit('.', 1)[-1] != 'IsolatedUiDatabaseTest' and re.search(r'jdbc:(?:mysql:|h2:file:)', source):
                raise RuntimeError('Unreviewed direct database URL in ' + name)
            selected.append(name)
    # This invocation deliberately cannot start the full app/default H2 lifecycle.
    (OUT / 'java-isolated-selection.json').write_text(json.dumps({'selected': selected, 'deferred': deferred}, indent=2), encoding='utf-8')
    settings = dotenv_values(ROOT / 'scripts/.env.local')
    token = uuid.uuid4().hex
    database = 'rui_stage9_test_' + token
    user = 'rui9_' + token[:20]
    password = secrets.token_urlsafe(30)
    assert re.fullmatch(r'rui_stage9_test_[a-f0-9]{32}', database)
    # Only DDL from the checked-in snapshot; no USE, qualified target or copied rows.
    schema = (ROOT / 'Research-agent-app/src/main/resources/db/schema.sql').read_text(encoding='utf-8-sig')
    statements = [sqlparse.format(s, strip_comments=True).strip() for s in sqlparse.split(schema)]
    statements = [s for s in statements if s]
    if any(not re.match(r'CREATE TABLE IF NOT EXISTS\s+`?\w+`?\s*\(', s, re.I) for s in statements):
        raise RuntimeError('Schema contains non-table DDL; review before running')
    admin = pymysql.connect(host='127.0.0.1', user=settings.get('RESEARCH_MYSQL_USER') or 'root',
                            password=settings.get('RESEARCH_MYSQL_PASSWORD') or os.environ.get('RESEARCH_MYSQL_PASSWORD', ''),
                            autocommit=True, charset='utf8mb4')
    created_db = created_user = False
    report = {'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'database': database,
              'schemaOnly': True, 'businessDataCopied': False, 'ddlStatements': len(statements)}
    (OUT / 'java-isolation-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    try:
        with admin.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE `{database}` CHARACTER SET utf8mb4')
            created_db = True
            cursor.execute('CREATE USER %s@\'localhost\' IDENTIFIED BY %s', (user, password))
            created_user = True
            cursor.execute(f'GRANT ALL PRIVILEGES ON `{database}`.* TO %s@\'localhost\'', (user,))
        with pymysql.connect(host='127.0.0.1', user=user, password=password, database=database, autocommit=True, charset='utf8mb4') as connection:
            with connection.cursor() as cursor:
                # Some UI tables omit ENGINE. Do not inherit a workstation MyISAM default.
                cursor.execute('SET SESSION default_storage_engine=InnoDB')
                for statement in statements:
                    cursor.execute(statement)
                cursor.execute('SELECT DATABASE()')
                assert cursor.fetchone()[0] == database
        env = os.environ.copy()
        temporary_files = ROOT / '.cache/stage9-java-tmp'
        temporary_files.mkdir(parents=True, exist_ok=True)
        # Do not inherit the developer's production datasource or default-model secrets.
        for key in list(env):
            if key.startswith(('SPRING_DATASOURCE_', 'RESEARCH_MYSQL_', 'AUTOBOTS_DATA_AGENT_')):
                del env[key]
        url = f'jdbc:mysql://127.0.0.1:3306/{database}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai'
        env.update(JAVA_HOME='D:/Java/JDK21', SPRING_PROFILES_ACTIVE='stage9-isolated',
                   SPRING_DATASOURCE_MYSQL_URL=url, SPRING_DATASOURCE_MYSQL_USERNAME=user,
                   SPRING_DATASOURCE_MYSQL_PASSWORD=password, SPRING_DATASOURCE_MYSQL_DRIVER_CLASS_NAME='com.mysql.cj.jdbc.Driver',
                   RESEARCH_UI_DB_TEST='true', RESEARCH_UI_DB_URL=url, RESEARCH_UI_DB_USER=user, RESEARCH_UI_DB_PASSWORD=password,
                   AUTOBOTS_DATA_AGENT_QDRANT_CONFIG_ENABLE='false', AUTOBOTS_DATA_AGENT_ES_CONFIG_ENABLE='false')
        env['JAVA_TOOL_OPTIONS'] = '-Djava.io.tmpdir=' + str(temporary_files)
        # Bypass only cmd.exe's 8191-character limit, using the standard Maven Java launcher.
        # Test selection remains one explicit -Dtest argument; no broad include fallback.
        maven_home = Path('D:/apache-maven-3.8.6')
        launcher = next((maven_home / 'boot').glob('plexus-classworlds-*.jar'))
        args = ['-classpath', str(launcher), '-Dclassworlds.conf=' + str(maven_home / 'bin/m2.conf'),
                '-Dmaven.home=' + str(maven_home), '-Dmaven.multiModuleProjectDirectory=' + str(ROOT),
                'org.codehaus.plexus.classworlds.launcher.Launcher', '-pl', 'Research-agent-app', '-am', 'test',
                '-DskipTests=false', '-Dtest=' + ','.join(selected), '-Dsurefire.failIfNoSpecifiedTests=false', '-Dstyle.color=never']
        argument_file = OUT / 'java-isolated-maven.args'
        argument_file.write_text('\n'.join('"' + value.replace('\\', '/') + '"' for value in args), encoding='utf-8')
        command = ['D:/Java/JDK21/bin/java.exe', '@' + str(argument_file)]
        report['selectedClasses'] = len(selected)
        report['deferredClasses'] = len(deferred)
        started = time.time()
        with (OUT / 'java-full-isolated.log').open('w', encoding='utf-8') as log:
            result = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=1800)
        report['exitCode'] = result.returncode
        totals = {'tests': 0, 'failures': 0, 'errors': 0, 'skipped': 0, 'classes': 0}
        report_paths = [path for module in ROOT.glob('Research-agent-*') for path in (module / 'target/surefire-reports').glob('TEST-*.xml')]
        for path in report_paths:
            suite = ET.parse(path).getroot()
            if suite.attrib.get('name') not in selected:
                continue
            # Reject reports from an earlier run rather than counting stale green files.
            if path.stat().st_mtime < started:
                continue
            totals['classes'] += 1
            for field in ('tests', 'failures', 'errors', 'skipped'):
                totals[field] += int(suite.attrib.get(field, 0))
        report['results'] = totals
        if totals['tests'] == 0 or totals['classes'] != len(selected):
            report['exitCode'] = result.returncode or 2
        # Redact disposable credentials even though their account is removed below.
        log_path = OUT / 'java-full-isolated.log'
        text = log_path.read_text(encoding='utf-8', errors='replace').replace(password, '[disposable credential redacted]')
        log_path.write_text(text, encoding='utf-8')
    finally:
        # The workstation may have a short MySQL wait_timeout; tests can outlive it.
        admin.ping(reconnect=True)
        with admin.cursor() as cursor:
            if created_user:
                cursor.execute('DROP USER %s@\'localhost\'', (user,))
            if created_db:
                cursor.execute(f'DROP DATABASE `{database}`')
        admin.close()
        report['temporaryDatabaseRemoved'] = created_db
        report['temporaryUserRemoved'] = created_user
        report['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
        (OUT / 'java-isolation-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
    raise SystemExit(report.get('exitCode', 1))

if __name__ == '__main__':
    main()
