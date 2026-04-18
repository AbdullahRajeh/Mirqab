import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { AuthSessionUser } from "../types";
import { HttpError } from "../utils/http-error";
import { validateLoginBody } from "../validation/auth";

type AuthControllerOptions = {
  adminUsername: string;
  adminPassword: string;
  cookieName: string;
};

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function createAuthController(options: AuthControllerOptions): {
  login: (req: Request, res: Response) => Promise<void>;
  logout: (req: Request, res: Response) => Promise<void>;
  session: (req: Request, res: Response) => Promise<void>;
} {
  return {
    async login(req: Request, res: Response): Promise<void> {
      const credentials = validateLoginBody(req.body);
      const isValidUsername = secureEquals(credentials.username, options.adminUsername);
      const isValidPassword = secureEquals(credentials.password, options.adminPassword);

      if (!isValidUsername || !isValidPassword) {
        throw new HttpError(401, "invalid_credentials", "Invalid username or password");
      }

      await regenerateSession(req);

      const adminUser: AuthSessionUser = {
        username: options.adminUsername,
        role: "admin",
      };

      req.session.adminUser = adminUser;
      await saveSession(req);

      res.json({
        success: true,
        redirectTo: "/dashboard",
      });
    },

    async logout(req: Request, res: Response): Promise<void> {
      if (req.session.adminUser) {
        await destroySession(req);
      }

      res.clearCookie(options.cookieName);
      res.json({ success: true });
    },

    async session(req: Request, res: Response): Promise<void> {
      const authenticated = Boolean(req.session.adminUser);
      res.json({
        authenticated,
        user: req.session.adminUser ?? null,
      });
    },
  };
}
