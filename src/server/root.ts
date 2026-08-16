import { router, workspaceProcedure } from "./trpc";
import { pagesRouter } from "./routers/pages";
import { dbRouter } from "./routers/db";
import { authRouter } from "./routers/auth";
import { workspaceRouter } from "./routers/workspace";

export const appRouter = router({
  auth: authRouter,
  pages: pagesRouter,
  db: dbRouter,
  workspace: workspaceRouter,
  me: workspaceProcedure.query(({ ctx }) => ({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
    workspace: { id: ctx.workspace.id, name: ctx.workspace.name },
  })),
});

export type AppRouter = typeof appRouter;
