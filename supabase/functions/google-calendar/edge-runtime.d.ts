// Local editor declarations for this Supabase Edge Function. The deployed
// runtime resolves the jsr:/npm: imports; these declarations keep the root
// TypeScript project from reporting false errors in VS Code.
declare namespace Deno {
  const env: {
    get(name: string): string | undefined;
  };

  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'jsr:@supabase/functions-js/edge-runtime.d.ts' {}

declare module 'npm:@supabase/supabase-js@2.97.0' {
  export function createClient(...args: unknown[]): any;
}
