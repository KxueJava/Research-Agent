import { writeFile } from 'node:fs/promises';
import { patrolDemoHtml } from '../public/examples/patrol-game.mjs';
await writeFile(new URL('../public/examples/orbit-patrol.html', import.meta.url), patrolDemoHtml(), 'utf8');
