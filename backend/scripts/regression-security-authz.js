const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function expectUnauthorized(path, method = 'GET') {
  const response = await fetch(`${BASE_URL}${path}`, { method });
  if (response.status !== 401) {
    const body = await response.text();
    throw new Error(
      `Expected 401 for ${method} ${path}, got ${response.status}. Body: ${body}`,
    );
  }
  console.log(`OK 401: ${method} ${path}`);
}

async function run() {
  console.log('[security-authz] Starting unauthorized access regression...');

  await expectUnauthorized('/drivers');
  await expectUnauthorized('/drivers/00000000-0000-0000-0000-000000000000');
  await expectUnauthorized('/vehicles/00000000-0000-0000-0000-000000000000', 'PATCH');
  await expectUnauthorized('/orders/00000000-0000-0000-0000-000000000000');
  await expectUnauthorized('/orders/00000000-0000-0000-0000-000000000000/dispatch');

  console.log('[security-authz] Completed successfully.');
}

run().catch((error) => {
  console.error('[security-authz] FAILED:', error.message || error);
  process.exit(1);
});
