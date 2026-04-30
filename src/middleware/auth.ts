import type { NextFunction, Request, RequestHandler, Response } from "express";

function isAdminAuthenticated(req: Request): boolean {
  return req.session.adminUser?.role === "admin";
}

export const requireAdminApi: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (isAdminAuthenticated(req)) {
    next();
    return;
  }

  res.status(401).json({
    code: "unauthorized",
    message: "Admin authentication required",
  });
};

export const requireAdminPage: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (isAdminAuthenticated(req)) {
    next();
    return;
  }

  res.redirect("/login");
};

export const redirectAuthedAdmin: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (isAdminAuthenticated(req)) {
    res.redirect("/dashboard");
    return;
  }

  next();
};
