// bun run setup → imprime tus organizaciones y canales de Buffer para rellenar los secrets
import { gql } from "./buffer";

const { account } = await gql(`query { account { organizations { id name } } }`);

for (const org of account.organizations) {
  console.log(`\nOrganización: ${org.name}  →  ${org.id}`);
  const { channels } = await gql(
    `query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name service } }`,
  );
  for (const c of channels) console.log(`  ${c.service.padEnd(10)} ${c.name.padEnd(30)} ${c.id}`);
}

console.log("\nCopia los IDs de Instagram y LinkedIn en BUFFER_IG_CHANNEL y BUFFER_LI_CHANNEL.");
