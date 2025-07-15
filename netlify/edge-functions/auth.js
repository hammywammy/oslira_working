export default async function (request) {
  const url = new URL(request.url);
  
  // Public endpoints that don't require authentication
  const publicEndpoints = [
    '/api/config',
    '/api/health'
  ];
  
  // Allow public endpoints without authentication
  if (publicEndpoints.includes(url.pathname)) {
    switch (url.pathname) {  
      case '/api/config':
        return handleConfig(request);
      case '/api/health':
        return new Response(
          JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
          { headers: { 'Content-Type': 'application/json' } }
        );
    }
  }
  
  // All other /api/* routes require authentication
  return requireAuth(request);
}

async function handleConfig(request) {
  // This endpoint provides ONLY the public configuration needed by the browser
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  const workerUrl = Deno.env.get('WORKER_URL');

  // Check if required variables are present
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables:', { 
      hasUrl: !!supabaseUrl, 
      hasKey: !!supabaseKey,
      hasWorker: !!workerUrl 
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Configuration not available',
        debug: {
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseKey,
          hasWorker: !!workerUrl
        }
      }), 
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  // Return public configuration
  const config = {
    supabaseUrl,
    supabaseAnonKey: supabaseKey,
    workerUrl: workerUrl || null
  };

  return new Response(JSON.stringify(config), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    }
  });
}

async function requireAuth(request) {
  const authHeader = request.headers.get("authorization") || "";
  
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Verify with Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }
    
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseKey
      }
    });
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const user = await response.json();
    
    return new Response(
      JSON.stringify({ 
        message: "Authorized",
        user: { 
          id: user.id, 
          email: user.email 
        } 
      }),
      { headers: { "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error('Auth verification error:', error);
    return new Response(
      JSON.stringify({ error: "Authentication failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
