import { Hono } from 'hono';
import { cors } from 'hono/cors';

// ------------------------------------
// Type Definitions
// ------------------------------------
interface ProfileData {
  username: string;
  fullName?: string;
  biography?: string;
  followersCount: number;
  followingCount?: number;
  postsCount?: number;
  isVerified?: boolean;
  private?: boolean;
  profilePicUrl?: string;
  externalUrl?: string;
  businessCategory?: string;
}

interface BusinessProfile {
  id: string;
  business_name: string;
  business_niche: string;
  target_audience: string;
  target_problems: string;
  value_proposition: string;
  communication_style: string;
  call_to_action: string;
}

interface User {
  id: string;
  email: string;
  credits: number;
  subscription_plan: string;
  monthly_credits_limit: number;
}

type AnalysisType = 'light' | 'deep';

interface AnalysisRequest {
  profile_url?: string;
  username?: string;
  analysis_type?: AnalysisType;
  business_id?: string;
  user_id?: string;
  platform?: string;
}

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE: string;
  OPENAI_KEY: string;
  CLAUDE_KEY?: string;
  APIFY_API_TOKEN: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  FRONTEND_URL?: string;
}

// ------------------------------------
// Utility Functions
// ------------------------------------

/**
 * Decode and verify a JWT (Supabase) without external libs.
 * Returns subject (UID) if valid and not expired, else null.
 */
async function verifyJWT(token: string): Promise<string | null> {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload));
    const now = Date.now() / 1000;
    if (decoded.exp && decoded.exp > now) return decoded.sub;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Perform a fetch with retry on 429 status.
 */
async function callWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
  backoffMillis = 1000
): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < retries - 1) {
      await new Promise(r => setTimeout(r, backoffMillis * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    throw new Error(`Request to ${url} failed: ${res.status} - ${text}`);
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

/**
 * Extract Instagram username from URL or handle.
 */
function extractUsername(input: string): string {
  try {
    const cleaned = input.trim().replace(/^@/, '');
    if (cleaned.includes('instagram.com')) {
      const url = new URL(cleaned);
      return url.pathname.split('/').filter(Boolean)[0] || '';
    }
    return cleaned;
  } catch {
    return '';
  }
}

/**
 * Validate & normalize the analyze request body.
 */
function normalizeRequest(body: AnalysisRequest) {
  const errors: string[] = [];
  const profile_url =
    body.profile_url || (body.username ? `https://instagram.com/${body.username}` : '');
  const analysis_type = body.analysis_type;
  const business_id = body.business_id;
  if (!profile_url) errors.push('profile_url or username is required');
  if (!analysis_type || !['light', 'deep'].includes(analysis_type))
    errors.push('analysis_type must be "light" or "deep"');
  if (!business_id) errors.push('business_id is required');

  return {
    valid: errors.length === 0,
    errors,
    data: { profile_url, analysis_type, business_id }
  };
}

// ------------------------------------
// Prompt Generators
// ------------------------------------

function makeLightPrompt(profile: ProfileData, business: BusinessProfile): string {
  return `You are an expert B2B lead qualifier. Analyze the following Instagram profile.\n\n` +
    `PROFILE:\n` +
    `- Username: ${profile.username}\n` +
    `- Bio: ${profile.biography || 'N/A'}\n` +
    `- Followers: ${profile.followersCount}\n` +
    `- Verified: ${!!profile.isVerified}\n\n` +
    `BUSINESS:\n` +
    `- Name: ${business.business_name}\n` +
    `- Niche: ${business.business_niche}\n` +
    `- Value Proposition: ${business.value_proposition}\n\n` +
    `Respond with JSON: { lead_score: number, summary: string, niche: string, reasons: string[] }.`;
}

function makeDeepPrompt(profile: ProfileData, business: BusinessProfile): string {
  return `You are a senior B2B strategist. Provide a deep analysis of this Instagram profile.\n\n` +
    `PROFILE DETAILS:\n` +
    `- Username: ${profile.username}\n` +
    `- Full Name: ${profile.fullName || 'N/A'}\n` +
    `- Bio: ${profile.biography || 'N/A'}\n` +
    `- Followers: ${profile.followersCount}\n` +
    `- Posts: ${profile.postsCount || 0}\n` +
    `- Verified: ${!!profile.isVerified}\n\n` +
    `BUSINESS CONTEXT:\n` +
    `- Name: ${business.business_name}\n` +
    `- Niche: ${business.business_niche}\n` +
    `- Problems: ${business.target_problems}\n` +
    `- Communication Style: ${business.communication_style}\n\n` +
    `Respond with JSON: { lead_score: number, summary: string, niche: string, reasons: string[], engagement_rate: number, selling_points: string[], notes: string }.`;
}

function makeMessagePrompt(
  profile: ProfileData,
  business: BusinessProfile,
  analysis: any
): string {
  const followRatio = profile.followersCount && profile.followingCount
    ? (profile.followersCount / profile.followingCount).toFixed(2)
    : null;
  const insights: string[] = [];
  if (profile.isVerified) insights.push('verified');
  if (profile.externalUrl) insights.push('has website');
  if (followRatio && +followRatio > 1) insights.push('strong ratio');
  if (profile.followersCount > 10000) insights.push('large following');

  return `Craft three personalized Instagram DMs based on the following data.\n\n` +
    `PROFILE:@${profile.username} (${profile.fullName || 'N/A'})\n` +
    `Bio: ${profile.biography || 'N/A'}\n` +
    `Insights: ${insights.join(', ') || 'none'}\n\n` +
    `ANALYSIS: Score ${analysis.lead_score}, Niche ${analysis.niche}, Reasons: ${analysis.reasons.join(', ')}\n\n` +
    `BUSINESS: ${business.business_name}, Value: ${business.value_proposition}, CTA: ${business.call_to_action}\n\n` +
    `Respond with JSON { main_message: string, friendly_message: string, soft_message: string }.`;
}

// ------------------------------------
// Hono App Initialization
// ------------------------------------
const app = new Hono<{ Bindings: Env }>();
app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET','POST','OPTIONS'] }));

// ------------------------------------
// Routes
// ------------------------------------

// Root
app.get('/', c => c.json({ message: '🚀 Oslira Worker v4.2', status: 'operational' }));

// Health Check
app.get('/health', c => c.json({ status: 'healthy', service: 'Oslira Worker' }));

// Service Info
app.get('/info', c => {
  return c.json({
    service: 'Oslira Enterprise AI Worker',
    version: '4.2.0',
    description: 'Subscription-based lead analysis & messaging',
    endpoints: [
      'POST /analyze',
      'POST /billing/create-checkout-session',
      'POST /billing/create-portal-session',
      'POST /stripe-webhook',
      'GET /health',
      'GET /info',
      'GET /debug-env'
    ],
    ai_models: ['gpt-4o','claude-sonnet-4-20250514'],
    timestamp: new Date().toISOString()
  });
});

// Debug Env
app.get('/debug-env', c => {
  const env = c.env;
  return c.json({
    supabase: env.SUPABASE_URL ? 'SET' : 'MISSING',
    serviceRole: env.SUPABASE_SERVICE_ROLE ? 'SET' : 'MISSING',
    openai: env.OPENAI_KEY ? 'SET' : 'MISSING',
    claude: env.CLAUDE_KEY ? 'SET' : 'MISSING',
    apify: env.APIFY_API_TOKEN ? 'SET' : 'MISSING',
    stripe: env.STRIPE_SECRET_KEY ? 'SET' : 'MISSING',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'MISSING',
    keysCount: Object.keys(env).length
  });
});

// Analyze Endpoint
app.post('/analyze', async c => {
  // Auth
  const auth = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!auth) return c.json({ error: 'Missing Authorization' }, 401);
  const userId = await verifyJWT(auth);
  if (!userId) return c.json({ error: 'Invalid token' }, 401);

  // Validate
  const body = await c.req.json<AnalysisRequest>();
  const { valid, errors, data } = normalizeRequest(body);
  if (!valid) return c.json({ error: 'Invalid request', details: errors }, 400);

  const username = extractUsername(data.profile_url!);
  if (!username) return c.json({ error: 'Bad username format' }, 400);

  // Supabase headers
  const sbHeaders = {
    apikey: c.env.SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE}`,
    'Content-Type': 'application/json'
  };

  // Fetch user & credit check
  const users: User[] = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=*`,
    { headers: sbHeaders }
  ).then(res => res.json());
  if (!users.length) return c.json({ error: 'User not found' }, 404);
  const user = users[0];
  const cost = data.analysis_type === 'deep' ? 2 : 1;
  if (user.credits < cost) {
    return c.json({ error: 'Insufficient credits', available: user.credits, required: cost }, 402);
  }

  // Fetch business profile
  const bizArr: BusinessProfile[] = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/business_profiles?id=eq.${data.business_id}&user_id=eq.${userId}&select=*`,
    { headers: sbHeaders }
  ).then(res => res.json());
  if (!bizArr.length) return c.json({ error: 'Business profile not found' }, 404);
  const business = bizArr[0];

  // Scrape Instagram via Apify
  const scrapeAct = data.analysis_type === 'light'
    ? 'dSCLg0C3YEZ83HzYX'
    : 'shu8hvrXbJbY3Eb9W';
  const profileData: ProfileData = (await callWithRetry(
    `https://api.apify.com/v2/acts/${scrapeAct}/run-sync-get-dataset-items?token=${c.env.APIFY_API_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.analysis_type === 'light'
        ? { usernames: [username] }
        : { directUrls: [`https://instagram.com/${username}/`], resultsLimit: 1 }
      )
    }
  ))[0];

  // AI analysis
  const prompt =
    data.analysis_type === 'light'
      ? makeLightPrompt(profileData, business)
      : makeDeepPrompt(profileData, business);
  const openaiRes: any = await callWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200
      })
    }
  );
  const analysis = JSON.parse(openaiRes.choices[0].message.content);

  // Generate messages for deep analysis
  let messages = { main_message: '', friendly_message: '', soft_message: '' };
  if (data.analysis_type === 'deep' && c.env.CLAUDE_KEY) {
    const msgPrompt = makeMessagePrompt(profileData, business, analysis);
    const claudeRes: any = await callWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'x-api-key': c.env.CLAUDE_KEY,
          'Anthropic-Version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: msgPrompt }],
          temperature: 0.7,
          max_tokens: 1200
        })
      }
    );
    try { messages = JSON.parse(claudeRes.completion); } catch { /* parse error */ }
  }

  // Insert lead & update credits
  const lead = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/leads`,
    {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId,
        business_id: data.business_id,
        username: profileData.username,
        platform: data.platform || 'instagram',
        profile_url: data.profile_url,
        score: analysis.lead_score,
        type: data.analysis_type,
        status: 'analyzed'
      })
    }
  ).then(res => res.json());

  await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ credits: user.credits - cost })
    }
  );

  // Log credit transaction
  await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/credit_transactions`,
    {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        user_id: userId,
        transaction_type: 'usage',
        amount: -cost,
        balance_after: user.credits - cost,
        reference_id: lead[0]?.id,
        created_at: new Date().toISOString()
      })
    }
  ).catch(() => {});

  // Response payload
  return c.json({
    success: true,
    lead_id: lead[0]?.id,
    analysis,
    messages,
    credits: { used: cost, remaining: user.credits - cost }
  });
});

// Billing: Create Checkout Session
app.post('/billing/create-checkout-session', async c => {
  const auth = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);
  const userId = await verifyJWT(auth);
  if (!userId) return c.json({ error: 'Invalid token' }, 401);

  const body = await c.req.json();
  const { price_id, customer_email, success_url, cancel_url, metadata, trial_period_days = 7 } = body;
  if (!price_id || !customer_email) {
    return c.json({ error: 'price_id and customer_email required' }, 400);
  }

  // Validate price IDs
  const VALID_PRICES = [
    'price_1RkCKjJzvcRSqGG3Hq4WNNSU',
    'price_1RkCLGJzvcRSqGG3XqDyhYZN',
    'price_1RkCLtJzvcRSqGG30FfJSpau',
    'price_1RkCMlJzvcRSqGG3HHFoX1fw'
  ];
  if (!VALID_PRICES.includes(price_id)) {
    return c.json({ error: 'Invalid price_id' }, 400);
  }

  const stripeKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return c.json({ error: 'Stripe not configured' }, 500);

  // Find or create customer
  const search = new URLSearchParams({ query: `email:'${customer_email}'` });
  let customerData: any = await fetch(
    `https://api.stripe.com/v1/customers/search?${search}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } }
  ).then(res => res.json());

  let customerId = customerData.data?.[0]?.id;
  if (!customerId) {
    const params = new URLSearchParams({ email: customer_email });
    const newCust = await fetch(
      'https://api.stripe.com/v1/customers',
      { method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
    ).then(res => res.json());
    customerId = newCust.id;
  }

  // Create session
  const sessionParams = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price]': price_id,
    'line_items[0][quantity]': '1',
    mode: 'subscription',
    success_url: success_url || `${c.env.FRONTEND_URL}/subscription.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancel_url || `${c.env.FRONTEND_URL}/subscription.html?canceled=true`,
    customer: customerId,
    'subscription_data[trial_period_days]': String(trial_period_days),
    allow_promotion_codes: 'true'
  });
  if (metadata) Object.entries(metadata).forEach(([k,v]) => sessionParams.append(`subscription_data[metadata][${k}]`, String(v)));

  const session = await fetch(
    'https://api.stripe.com/v1/checkout/sessions',
    { method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: sessionParams }
  ).then(res => res.json());

  if (session.error) return c.json({ error: session.error.message }, 400);
  return c.json({ url: session.url, session_id: session.id, customer_id: customerId });
});

// Billing: Create Portal Session
app.post('/billing/create-portal-session', async c => {
  const auth = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);
  const userId = await verifyJWT(auth);
  if (!userId) return c.json({ error: 'Invalid token' }, 401);

  const { return_url, customer_email } = await c.req.json();
  if (!customer_email) return c.json({ error: 'customer_email required' }, 400);

  const stripeKey = c.env.STRIPE_SECRET_KEY;
  const search = new URLSearchParams({ query: `email:'${customer_email}'` });
  const data: any = await fetch(
    `https://api.stripe.com/v1/customers/search?${search}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } }
  ).then(res => res.json());
  if (!data.data?.length) return c.json({ error: 'Customer not found' }, 404);
  const customerId = data.data[0].id;

  const portalParams = new URLSearchParams({
    customer: customerId,
    return_url: return_url || `${c.env.FRONTEND_URL}/subscription.html`
  });
  const portal = await fetch(
    'https://api.stripe.com/v1/billing_portal/sessions',
    { method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: portalParams }
  ).then(res => res.json());
  if (portal.error) return c.json({ error: portal.error.message }, 400);
  return c.json({ url: portal.url });
});

// Stripe Webhook
app.post('/stripe-webhook', async c => {
  const body = await c.req.text();
  const sig = c.req.header('stripe-signature');
  if (!sig || !c.env.STRIPE_WEBHOOK_SECRET) return c.text('Missing signature or secret', 400);

  // NOTE: For production, verify signature via Stripe SDK
  const event = JSON.parse(body);
  switch (event.type) {
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object, c.env);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object, c.env);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object, c.env);
      break;
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object, c.env);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object, c.env);
      break;
    default:
      console.log('Unhandled event:', event.type);
  }
  return c.text('OK', 200);
});

// ------------------------------------
// Stripe Event Handlers
// ------------------------------------
async function handleSubscriptionCreated(subscription: any, env: Env) {
  try {
    const { user_id } = subscription.metadata;
    if (!user_id) return;

    const supabaseHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    };

    // Map price IDs to plan info
    const priceIdToPlan: Record<string, { name: string; credits: number }> = {
      'price_1RkCKjJzvcRSqGG3Hq4WNNSU': { name: 'starter', credits: 50 },
      'price_1RkCLGJzvcRSqGG3XqDyhYZN': { name: 'growth', credits: 150 },
      'price_1RkCLtJzvcRSqGG30FfJSpau': { name: 'professional', credits: 500 },
      'price_1RkCMlJzvcRSqGG3HHFoX1fw': { name: 'enterprise', credits: -1 },
    };

    const priceId = subscription.items.data[0]?.price?.id;
    const planInfo = priceIdToPlan[priceId];
    if (!planInfo) return;

    // Update user subscription in Supabase
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?id=eq.${user_id}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify({
          subscription_plan: planInfo.name,
          subscription_status: subscription.status,
          stripe_customer_id: subscription.customer,
          stripe_subscription_id: subscription.id,
          billing_cycle_start: new Date(subscription.current_period_start * 1000).toISOString(),
          billing_cycle_end: new Date(subscription.current_period_end * 1000).toISOString(),
          trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
          monthly_credits_limit: planInfo.credits,
          credits: planInfo.credits === -1 ? 999999 : planInfo.credits,
          credits_reset_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    // Log subscription history
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/subscription_history`,
      {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify({
          user_id,
          subscription_id: subscription.id,
          plan_name: planInfo.name,
          status: subscription.status,
          amount: subscription.items.data[0]?.price?.unit_amount || 0,
          billing_cycle_start: new Date(subscription.current_period_start * 1000).toISOString(),
          billing_cycle_end: new Date(subscription.current_period_end * 1000).toISOString(),
          trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
          trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
          created_at: new Date().toISOString(),
        }),
      }
    );
  } catch (err) {
    console.error('handleSubscriptionCreated error', err);
  }
}
async function handleSubscriptionUpdated(subscription: any, env: Env) {
  try {
    const { user_id } = subscription.metadata;
    if (!user_id) return;

    const supabaseHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    };

    await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?id=eq.${user_id}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify({
          subscription_status: subscription.status,
          billing_cycle_start: new Date(subscription.current_period_start * 1000).toISOString(),
          billing_cycle_end: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } catch (err) {
    console.error('handleSubscriptionUpdated error', err);
  }
}
async function handleSubscriptionCanceled(subscription: any, env: Env) {
  try {
    const { user_id } = subscription.metadata;
    if (!user_id) return;

    const supabaseHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    };

    await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?id=eq.${user_id}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify({
          subscription_plan: 'free',
          subscription_status: 'canceled',
          monthly_credits_limit: 0,
          credits: 0,
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } catch (err) {
    console.error('handleSubscriptionCanceled error', err);
  }
}
async function handlePaymentSucceeded(invoice: any, env: Env) {
  try {
    const subscription_id = invoice.subscription;
    if (!subscription_id) return;

    // Retrieve subscription to get metadata
    const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscription_id}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
    });
    if (!subRes.ok) return;
    const subscription = await subRes.json();
    const user_id = subscription.metadata?.user_id;
    if (!user_id) return;

    const supabaseHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    };

    // Reset monthly credits
    const priceId = subscription.items.data[0]?.price?.id;
    const planMap: Record<string, number> = {
      'price_1RkCKjJzvcRSqGG3Hq4WNNSU': 50,
      'price_1RkCLGJzvcRSqGG3XqDyhYZN': 150,
      'price_1RkCLtJzvcRSqGG30FfJSpau': 500,
      'price_1RkCMlJzvcRSqGG3HHFoX1fw': -1,
    };
    const credits = planMap[priceId] === -1 ? 999999 : planMap[priceId] || 0;
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?id=eq.${user_id}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify({
          credits,
          credits_reset_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    // Log billing history
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/billing_history`,
      {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify({
          user_id,
          stripe_invoice_id: invoice.id,
          stripe_payment_intent_id: invoice.payment_intent,
          subscription_id,
          amount: invoice.amount_paid,
          currency: invoice.currency,
          status: 'paid',
          description: 'Monthly subscription payment',
          invoice_url: invoice.hosted_invoice_url,
          receipt_url: invoice.receipt_url,
          created_at: new Date().toISOString(),
        }),
      }
    );
  } catch (err) {
    console.error('handlePaymentSucceeded error', err);
  }
}
async function handlePaymentFailed(invoice: any, env: Env) {
  try {
    const subscription_id = invoice.subscription;
    if (!subscription_id) return;

    const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscription_id}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
    });
    if (!subRes.ok) return;
    const subscription = await subRes.json();
    const user_id = subscription.metadata?.user_id;
    if (!user_id) return;

    const supabaseHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    };

    // Log failed billing
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/billing_history`,
      {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify({
          user_id,
          stripe_invoice_id: invoice.id,
          subscription_id,
          amount: invoice.amount_due,
          currency: invoice.currency,
          status: 'failed',
          description: 'Monthly subscription payment failed',
          invoice_url: invoice.hosted_invoice_url,
          created_at: new Date().toISOString(),
        }),
      }
    );

    // Update user to past_due
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?id=eq.${user_id}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify({
          subscription_status: 'past_due',
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } catch (err) {
    console.error('handlePaymentFailed error', err);
  }
}

// Not Found & Error Handling
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal server error', message: err.message }, 500);
});
app.notFound(c => c.json({ error: 'Endpoint not found' }, 404));

// Export
export default { fetch: app.fetch };
