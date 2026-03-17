#!/bin/sh
set -e

echo "=== Somma Imoveis - Starting ==="

# Run Prisma db push to create/update tables
echo "Running Prisma db push..."
npx prisma db push --schema=./prisma/schema.prisma --skip-generate 2>&1 || echo "Warning: db push failed, tables may already exist"

# Seed admin user if no users exist
echo "Checking if seed is needed..."
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log('Users already exist (' + count + '), skipping seed.');
    return;
  }

  console.log('No users found. Creating admin user...');
  const password = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      email: 'admin@somma.com.br',
      name: 'Paulo Vitor',
      password: password,
      role: 'ADMIN',
      phone: '(11) 99999-0000',
    },
  });
  console.log('Admin user created: admin@somma.com.br / admin123');
}

seed()
  .catch(e => { console.error('Seed error:', e.message); })
  .finally(() => prisma.\$disconnect());
" 2>&1

echo "=== Starting Next.js server ==="
exec node apps/web/server.js
