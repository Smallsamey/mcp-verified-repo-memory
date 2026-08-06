import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractSnippetFromFile } from '../src/verify/extract.js';
import { normalizeSnippet, hashSnippet } from '../src/verify/normalize.js';
import { verifyCitation } from '../src/verify/jit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('JIT Verification', () => {
    const repoRoot = join(__dirname, 'fixtures', 'jit-repo');
    const outsideRepoRoot = join(__dirname, 'fixtures', 'outside-repo');
    const testFile = join(repoRoot, 'test.txt');

    beforeEach(() => {
        mkdirSync(repoRoot, { recursive: true });
        writeFileSync(testFile, 'line 1\nline 2\nline 3\nline 4\nline 5\n');
    });

    afterEach(() => {
        rmSync(repoRoot, { recursive: true, force: true });
        rmSync(outsideRepoRoot, { recursive: true, force: true });
    });

    it('validates unmodified citation', () => {
        const rawText = extractSnippetFromFile(repoRoot, 'test.txt', 2, 3, 2000000);
        const normalized = normalizeSnippet(rawText);
        const sha256 = hashSnippet(normalized);

        const citation = {
            id: 'cit-1',
            path: 'test.txt',
            startLine: 2,
            endLine: 3,
            snippetSha256: sha256,
            snippetText: rawText,
            lastValidatedAt: null,
            lastValidationStatus: null as any,
            lastValidationDetail: null
        };

        const result = verifyCitation(citation, repoRoot, 2000000);
        expect(result.lastValidationStatus).toBe('VALID');
    });

    it('relocates shifted citation', () => {
        const rawText = extractSnippetFromFile(repoRoot, 'test.txt', 2, 3, 2000000);
        const normalized = normalizeSnippet(rawText);
        const sha256 = hashSnippet(normalized);

        const citation = {
            id: 'cit-2',
            path: 'test.txt',
            startLine: 2,
            endLine: 3,
            snippetSha256: sha256,
            snippetText: rawText,
            lastValidatedAt: null,
            lastValidationStatus: null as any,
            lastValidationDetail: null
        };

        // Insert a line at the top to shift lines down
        writeFileSync(testFile, 'inserted line\nline 1\nline 2\nline 3\nline 4\nline 5\n');

        const result = verifyCitation(citation, repoRoot, 2000000);
        expect(result.lastValidationStatus).toBe('RELOCATED');
        expect(result.startLine).toBe(3); // shifted +1
        expect(result.endLine).toBe(4);
    });

    it('marks as STALE when content changed', () => {
        const rawText = extractSnippetFromFile(repoRoot, 'test.txt', 2, 3, 2000000);
        const normalized = normalizeSnippet(rawText);
        const sha256 = hashSnippet(normalized);

        const citation = {
            id: 'cit-3',
            path: 'test.txt',
            startLine: 2,
            endLine: 3,
            snippetSha256: sha256,
            snippetText: rawText,
            lastValidatedAt: null,
            lastValidationStatus: null as any,
            lastValidationDetail: null
        };

        // Modify the snippet content
        writeFileSync(testFile, 'line 1\nline 2 changed\nline 3\nline 4\nline 5\n');

        const result = verifyCitation(citation, repoRoot, 2000000);
        expect(result.lastValidationStatus).toBe('STALE');
    });

    it('marks as MISSING when file deleted', () => {
        const rawText = extractSnippetFromFile(repoRoot, 'test.txt', 2, 3, 2000000);
        const normalized = normalizeSnippet(rawText);
        const sha256 = hashSnippet(normalized);

        const citation = {
            id: 'cit-4',
            path: 'test.txt',
            startLine: 2,
            endLine: 3,
            snippetSha256: sha256,
            snippetText: rawText,
            lastValidatedAt: null,
            lastValidationStatus: null as any,
            lastValidationDetail: null
        };

        // Delete the file
        rmSync(testFile);

        const result = verifyCitation(citation, repoRoot, 2000000);
        expect(result.lastValidationStatus).toBe('MISSING');
    });

    it('rejects citation symlinks that resolve outside the repo', () => {
        const outsideFile = join(outsideRepoRoot, 'secret.txt');
        const linkPath = join(repoRoot, 'linked-secret.txt');
        mkdirSync(outsideRepoRoot, { recursive: true });
        writeFileSync(outsideFile, 'external secret\n');
        symlinkSync(outsideFile, linkPath);

        expect(() => extractSnippetFromFile(repoRoot, 'linked-secret.txt', 1, 1, 2000000)).toThrow(
            /Unsafe path traversal|disallowed directory access/
        );

        const rawText = 'external secret';
        const citation = {
            id: 'cit-5',
            path: 'linked-secret.txt',
            startLine: 1,
            endLine: 1,
            snippetSha256: hashSnippet(normalizeSnippet(rawText)),
            snippetText: rawText,
            lastValidatedAt: null,
            lastValidationStatus: null as any,
            lastValidationDetail: null
        };

        const result = verifyCitation(citation, repoRoot, 2000000);
        expect(result.lastValidationStatus).toBe('MISSING');
        expect(result.lastValidationDetail).toMatch(/Unsafe path traversal|disallowed directory access/);
    });
});
