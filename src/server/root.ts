import { router, workspaceProcedure } from "./trpc";
import { pagesRouter } from "./routers/pages";

export const appRouter = router({
  pages: pagesRouter,
  me: workspaceProcedure.query(({ ctx }) => ({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
    workspace: { id: ctx.workspace.id, name: ctx.workspace.name },
  })),
});

export type AppRouter = typeof appRouter;
