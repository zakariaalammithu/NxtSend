// Tests for the 12 workflow templates in workflows/: every file must parse,
// reference only operations/events that exist in the nodes, contain no
// secrets, and carry a Sticky Note explaining setup.
//
// NOTE: this file reads workflow JSON from disk with node:fs/path. That is
// fine here — tests run under Jest on Node and are never shipped to n8n
// (the published package only contains dist/), so the n8n Cloud import
// restrictions do not apply to this file.
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @n8n/community-nodes/no-restricted-globals */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { NXT_EVENTS, OPERATION_ENDPOINTS } from '../nodes/shared/constants';

const WORKFLOWS_DIR = path.join(__dirname, '..', 'workflows');
const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.json')).sort();

interface WorkflowNode {
	parameters?: Record<string, unknown>;
	credentials?: Record<string, { id: string | null; name: string }>;
	id: string;
	name: string;
	type: string;
	typeVersion: number;
	position: [number, number];
}

interface Workflow {
	name: string;
	nodes: WorkflowNode[];
	connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
	active: boolean;
	settings: Record<string, unknown>;
	pinData: Record<string, unknown>;
}

function loadWorkflows(): Array<{ file: string; workflow: Workflow }> {
	return files.map((file) => ({
		file,
		workflow: JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')) as Workflow,
	}));
}

describe('workflow templates', () => {
	it('there are exactly 12 templates', () => {
		expect(files).toHaveLength(12);
	});

	it.each(loadWorkflows())('$file parses and has the importable shape', ({ workflow }) => {
		expect(typeof workflow.name).toBe('string');
		expect(workflow.name.length).toBeGreaterThan(0);
		expect(Array.isArray(workflow.nodes)).toBe(true);
		expect(workflow.nodes.length).toBeGreaterThanOrEqual(3);
		expect(workflow.active).toBe(false);
		expect(workflow.pinData).toEqual({});
		for (const node of workflow.nodes) {
			expect(node.id).toMatch(/^[0-9a-f-]{36}$/);
			expect(node.name.length).toBeGreaterThan(0);
			expect(typeof node.typeVersion).toBe('number');
			expect(Array.isArray(node.position) && node.position.length).toBe(2);
		}
	});

	it.each(loadWorkflows())(
		'$file references only real NxtSend operations/events',
		({ workflow }) => {
			for (const node of workflow.nodes) {
				if (node.type === 'n8n-nodes-nxtsend.nxtSend') {
					const resource = node.parameters?.resource as string;
					const operation = node.parameters?.operation as string;
					expect(OPERATION_ENDPOINTS[resource]).toBeDefined();
					expect(OPERATION_ENDPOINTS[resource][operation]).toBeDefined();
				}
				if (node.type === 'n8n-nodes-nxtsend.nxtSendTrigger') {
					const event = node.parameters?.event as string;
					expect(NXT_EVENTS.map((e) => e.value)).toContain(event);
					expect(['webhook', 'polling']).toContain(node.parameters?.mode);
				}
			}
		},
	);

	it.each(loadWorkflows())('$file has a Sticky Note explaining setup', ({ workflow }) => {
		const notes = workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote');
		expect(notes.length).toBeGreaterThanOrEqual(1);
		for (const note of notes) {
			expect(String(note.parameters?.content ?? '')).toMatch(/setup/i);
		}
	});

	it.each(loadWorkflows())('$file contains no secrets or hardcoded keys', ({ workflow }) => {
		const text = JSON.stringify(workflow);
		expect(text).not.toMatch(/nxt_live_/);
		expect(text).not.toMatch(/nxt_test_/);
		expect(text).not.toMatch(/sk-[A-Za-z0-9]/);
		expect(text).not.toMatch(/"apiKey"\s*:\s*"[^"]+"/);
		for (const node of workflow.nodes) {
			for (const credential of Object.values(node.credentials ?? {})) {
				// Credential placeholders only — no real credential ids.
				expect(credential.id).toBeNull();
			}
		}
	});

	it.each(loadWorkflows())('$file connections reference existing nodes', ({ workflow }) => {
		const names = new Set(workflow.nodes.map((n) => n.name));
		for (const [from, outputs] of Object.entries(workflow.connections)) {
			expect(names.has(from)).toBe(true);
			for (const branch of outputs.main) {
				for (const target of branch) {
					expect(names.has(target.node)).toBe(true);
				}
			}
		}
	});

	it('no template uses a LinkedIn reply / connection-accepted trigger', () => {
		for (const { workflow } of loadWorkflows()) {
			for (const node of workflow.nodes) {
				if (node.type === 'n8n-nodes-nxtsend.nxtSendTrigger') {
					expect(String(node.parameters?.event ?? '')).not.toMatch(/linkedin|accepted/i);
				}
				if (node.type === 'n8n-nodes-nxtsend.nxtSend') {
					expect(node.parameters?.operation).not.toBe('sendLinkedinMessage');
					expect(node.parameters?.operation).not.toBe('sendConnectionRequest');
				}
			}
		}
	});

	it('the AI personalization template says the AI step must be configured', () => {
		const ai = loadWorkflows().find(({ file }) => file.startsWith('09-'));
		expect(ai).toBeDefined();
		const note = ai?.workflow.nodes.find((n) => n.type === 'n8n-nodes-base.stickyNote');
		expect(String(note?.parameters?.content ?? '')).toMatch(/PLACEHOLDER/i);
		expect(String(note?.parameters?.content ?? '')).toMatch(/must be configured|configure/i);
		expect(String(note?.parameters?.content ?? '')).toMatch(/NO AI-draft operation/i);
	});
});
