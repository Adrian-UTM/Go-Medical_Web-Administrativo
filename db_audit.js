const fs = require('fs');
const schema = JSON.parse(fs.readFileSync('C:/Users/adria/.gemini/antigravity-ide/brain/3be27d04-ab1f-48dc-ab96-5963f332ab76/schema.json', 'utf8'));
const dbReport = JSON.parse(fs.readFileSync('C:/Users/adria/.gemini/antigravity-ide/brain/3be27d04-ab1f-48dc-ab96-5963f332ab76/db_report.json', 'utf8'));

const targetTables = ['products', 'clients', 'orders', 'order_items', 'inventory_stock', 'inventory_movements', 'warehouses', 'quotes', 'quote_items', 'product_documents', 'service_tickets', 'profiles', 'carts', 'cart_items', 'abandoned_cart_opportunities', 'sales', 'sale_items'];

let md = '# Database Audit\n\n';

targetTables.forEach(t => {
  if (!schema[t]) {
    md += '## Table: ' + t + '\n\n**STATUS: DOES NOT EXIST**\n\n';
    return;
  }
  md += '## Table: ' + t + '\n\n';
  md += '### Columns\n';
  schema[t].forEach(col => {
    md += '- **' + col.column + '** (' + col.type + ') | Nullable: ' + col.nullable + ' | Default: ' + (col.default || 'None') + '\n';
  });
  md += '\n';

  const tableFks = dbReport.fks.filter(fk => fk.table_name === t);
  if (tableFks.length > 0) {
    md += '### Foreign Keys\n';
    tableFks.forEach(fk => {
      md += '- ' + fk.column_name + ' -> ' + fk.foreign_table_name + '(' + fk.foreign_column_name + ')\n';
    });
    md += '\n';
  }

  const tablePolicies = dbReport.policies.filter(p => p.tablename === t);
  if (tablePolicies.length > 0) {
    md += '### RLS Policies\n';
    tablePolicies.forEach(p => {
      md += '- ' + p.policyname + ' (' + p.cmd + ') - ' + p.roles + '\n';
    });
    md += '\n';
  }
});

md += '## Enums\n';
Object.keys(dbReport.enums).forEach(e => {
  md += '- **' + e + '**: ' + dbReport.enums[e].join(', ') + '\n';
});

fs.writeFileSync('C:/Users/adria/.gemini/antigravity-ide/brain/3be27d04-ab1f-48dc-ab96-5963f332ab76/db_audit.md', md);
