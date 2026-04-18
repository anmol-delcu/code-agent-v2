import express from "express";
import * as llmService from "../services/llm";
import { requireAuth } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

const router = express.Router();

router.use(requireAuth);

// @ts-ignore
router.post("/:containerId/messages", async (req: AuthRequest, res) => {
  const { containerId } = req.params;
  const { message, attachments = [], stream = false } = req.body;
  const userId = req.userId!;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      success: false,
      error: "Message is required",
    });
  }

  try {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const messageStream = llmService.sendMessageStream(
        userId,
        containerId,
        message,
        attachments
      );

      for await (const chunk of messageStream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const { userMessage, assistantMessage } = await llmService.sendMessage(
        userId,
        containerId,
        message,
        attachments
      );

      res.json({ success: true, userMessage, assistantMessage });
    }
  } catch (error) {
    console.error(
      "[chat] LLM error:",
      error instanceof Error ? error.message : error
    );
    if (stream) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          data: {
            error:
              error instanceof Error ? error.message : "Unknown error",
          },
        })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});

router.get("/:containerId/messages", async (req: AuthRequest, res) => {
  const { containerId } = req.params;
  const userId = req.userId!;

  try {
    const session = llmService.getOrCreateChatSession(userId, containerId);

    res.json({
      success: true,
      messages: session.messages,
      sessionId: session.id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
