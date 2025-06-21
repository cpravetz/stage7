import express from 'express';
import { PluginMarketplace } from './PluginMarketplace';

const app = express();
app.use(express.json());

const marketplace = new PluginMarketplace();

// Plan template storage (in-memory for now, replace with persistent storage)
const planTemplates: any[] = [];

// Helper: getHandlerForActionVerb
async function getHandlerForActionVerb(actionVerb: string) {
    // Check for plugin first
    const plugin = await marketplace.fetchOneByVerb(actionVerb);
    if (plugin) return { type: 'plugin', handler: plugin };
    // Check for plan template
    const planTemplate = await fetchPlanTemplateByVerb(actionVerb);
    if (planTemplate) return { type: 'planTemplate', handler: planTemplate };
    return null;
}

async function fetchPlanTemplateByVerb(actionVerb: string) {
    return planTemplates.find(t => t.actionVerb === actionVerb);
}

// --- Plan Template CRUD ---
// POST /planTemplates
app.post('/planTemplates', (req, res) => {
    (async () => {
        try {
            const template = req.body;
            // Enforce only one handler per actionVerb
            const existingHandler = await getHandlerForActionVerb(template.actionVerb);
            if (existingHandler) {
                return res.status(409).json({ error: 'Handler for this actionVerb already exists.' });
            }
            planTemplates.push(template);
            res.status(201).json({ message: 'Plan template created.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    })();
});

// GET /planTemplates/:id
app.get('/planTemplates/:id', (req, res) => {
    (async () => {
        try {
            const template = planTemplates.find(t => t.id === req.params.id);
            if (!template) return res.status(404).json({ error: 'Plan template not found.' });
            res.status(200).json(template);
        } catch (err: any) {
            res.status(404).json({ error: 'Plan template not found.' });
        }
    })();
});

// PUT /planTemplates/:id
app.put('/planTemplates/:id', (req, res) => {
    (async () => {
        try {
            const idx = planTemplates.findIndex(t => t.id === req.params.id);
            if (idx === -1) return res.status(404).json({ error: 'Plan template not found.' });
            // Enforce only one handler per actionVerb
            const newVerb = req.body.actionVerb;
            if (newVerb && newVerb !== planTemplates[idx].actionVerb) {
                const existingHandler = await getHandlerForActionVerb(newVerb);
                if (existingHandler) {
                    return res.status(409).json({ error: 'Handler for this actionVerb already exists.' });
                }
            }
            planTemplates[idx] = { ...planTemplates[idx], ...req.body };
            res.status(200).json({ message: 'Plan template updated.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    })();
});

// DELETE /planTemplates/:id
app.delete('/planTemplates/:id', (req, res) => {
    (async () => {
        try {
            const idx = planTemplates.findIndex(t => t.id === req.params.id);
            if (idx === -1) return res.status(404).json({ error: 'Plan template not found.' });
            planTemplates.splice(idx, 1);
            res.status(200).json({ message: 'Plan template deleted.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    })();
});

// --- Unified Handler Endpoint ---
// GET /actionVerbHandler/:actionVerb
app.get('/actionVerbHandler/:actionVerb', (req, res) => {
    (async () => {
        try {
            const { actionVerb } = req.params;
            const handler = await getHandlerForActionVerb(actionVerb);
            if (!handler) {
                return res.status(404).json({ error: 'No handler found for this actionVerb.' });
            }
            res.status(200).json(handler);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    })();
});

export default app;
