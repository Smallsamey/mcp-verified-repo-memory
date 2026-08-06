import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../src/storage/store.js';
import { registerStoreTool } from '../src/tools/store.js';
import { MAX_FILE_BYTES } from '../src/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Tool error results', () => {
    const repoRoot = join(__dirname, 'fixtures', 'tool-error-repo');
    const dataDir = join(repoRoot, '.verified-repo-memory');

    beforeEach(() => {
        mkdirSync(repoRoot, { recursive: true });
        writeFileSync(join(repoRoot, 'note.txt'), 'safe note\n');
    });

    afterEach(() => {
        rmSync(repoRoot, { recursive: true, force: true });
    });

    it('marks tool-level failures with the MCP isError flag', async () => {
        const server = new McpServer({ name: 'test-server', version: '0.0.0' });
        const store = new Store(repoRoot, dataDir);
        store.load();
        registerStoreTool(server, store, {
            repoRoot,
            dataDir,
            ttlDays: 28,
            maxFileBytes: MAX_FILE_BYTES,
            secretScan: true,
        });

        const registeredTools = (server as any)._registeredTools;
        const result = await registeredTools.vrm_store.handler({
            subject: 'bad citation',
            fact: 'path escapes should fail',
            citations: [{ path: '../outside.txt', startLine: 1, endLine: 1 }],
        });

        expect(result.isError).toBe(true);
        const payload = JSON.parse(result.content[0].text);
        expect(payload.isError).toBe(true);
        expect(payload.error).toMatch(/Unsafe path traversal|disallowed directory access/);
    });
});
