const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'archiflow-prod-2026';

function getAdminConfig() {
  const credJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (credJson) {
    try { return cert(JSON.parse(credJson)); } catch (e) { console.error('Error parsing credentials'); }
  }
  return undefined;
}

let _app;
if (getApps().length > 0) _app = getApp();
else _app = initializeApp({ projectId: FIREBASE_PROJECT_ID, credential: getAdminConfig() });

const db = getFirestore(_app);

async function main() {
  console.log('=== TENANT DEBUG ===\n');
  
  // 1. Find all tenants
  console.log('--- All Tenants ---');
  const tenantsSnap = await db.collection('tenants').get();
  for (const doc of tenantsSnap.docs) {
    const d = doc.data();
    console.log(`  ID: ${doc.id}`);
    console.log(`  Name: ${d.name}`);
    console.log(`  Code: ${d.code}`);
    console.log(`  Members: ${JSON.stringify(d.members || [])}`);
    console.log(`  CreatedBy: ${d.createdBy}`);
    console.log(`  CreatedAt: ${d.createdAt ? new Date(d.createdAt._seconds * 1000).toISOString() : 'N/A'}`);
    console.log('');
  }

  // 2. Find TEMPLO tenant specifically
  console.log('--- TEMPLO Tenant Details ---');
  const temploSnap = await db.collection('tenants').where('name', '==', 'TEMPLO').get();
  if (temploSnap.empty) {
    console.log('  Tenant "TEMPLO" not found. Searching partial...');
    const allTenants = tenantsSnap.docs;
    const partial = allTenants.filter(d => d.data().name && d.data().name.toUpperCase().includes('TEMPLO'));
    if (partial.length > 0) {
      for (const doc of partial) {
        console.log(`  Found: "${doc.data().name}" (ID: ${doc.id})`);
        console.log(`  Members: ${JSON.stringify(doc.data().members || [])}`);
      }
    } else {
      console.log('  No tenant matching "TEMPLO" found');
    }
  } else {
    for (const doc of temploSnap.docs) {
      const d = doc.data();
      console.log(`  Found: ID=${doc.id}`);
      console.log(`  Members array: ${JSON.stringify(d.members || [])}`);
      console.log(`  Member count: ${(d.members || []).length}`);
      
      // 3. Resolve member UIDs to names
      if (d.members && d.members.length > 0) {
        console.log('\n--- Member Details ---');
        for (const uid of d.members) {
          try {
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists) {
              const ud = userDoc.data();
              console.log(`  ${uid}: ${ud.name} (${ud.email}) - photoURL: ${ud.photoURL ? 'YES' : 'NO'}`);
            } else {
              console.log(`  ${uid}: USER DOC NOT FOUND`);
            }
          } catch (e) {
            console.log(`  ${uid}: Error reading user - ${e.message}`);
          }
        }
      }
    }
  }

  // 4. Check ALL users in the system
  console.log('\n--- All Users in Firestore ---');
  const usersSnap = await db.collection('users').get();
  console.log(`  Total users: ${usersSnap.size}`);
  for (const doc of usersSnap.docs) {
    const ud = doc.data();
    console.log(`  ${doc.id}: ${ud.name} (${ud.email}) role=${ud.role}`);
  }

  // 5. Check if there are other tenants that might have the users
  console.log('\n--- All Tenant Memberships ---');
  for (const doc of tenantsSnap.docs) {
    const d = doc.data();
    console.log(`  "${d.name}" (${(d.members||[]).length} members): ${JSON.stringify(d.members || [])}`);
  }

  console.log('\n=== END DEBUG ===');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); }).then(() => process.exit(0));
