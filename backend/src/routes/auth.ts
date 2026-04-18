import express from "express";
import { signup, login, getUserById } from "../services/auth";
import { requireAuth } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

const router = express.Router();

// @ts-ignore
router.post("/signup", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, error: "Email and password are required" });
  }

  if (!name || !name.trim()) {
    return res
      .status(400)
      .json({ success: false, error: "Name is required" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ success: false, error: "Password must be at least 8 characters" });
  }

  try {
    const result = await signup(email, password, name);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Signup failed",
    });
  }
});

// @ts-ignore
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, error: "Email and password are required" });
  }

  try {
    const result = await login(email, password);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    });
  }
});

// @ts-ignore
router.get("/me", requireAuth, (req: AuthRequest, res) => {
  const user = getUserById(req.userId!);
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  res.json({ success: true, user });
});

export default router;
