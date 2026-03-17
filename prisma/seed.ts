import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Somma Imóveis - Demo Data...\n");

  // ==========================================
  // LIMPAR DADOS EXISTENTES (ordem reversa)
  // ==========================================
  console.log("Limpando dados existentes...");
  await prisma.payment.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.propertyPhoto.deleteMany();
  await prisma.property.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  console.log("Dados limpos.\n");

  // ==========================================
  // USUARIOS (RBAC Demo: Admin, Corretor, Financeiro)
  // ==========================================
  const adminPassword = await bcrypt.hash("admin123", 10);
  const sommaPassword = await bcrypt.hash("somma123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@somma.com.br" },
    update: { password: adminPassword, name: "Paulo Vitor", role: "ADMIN", phone: "(11) 99999-0000" },
    create: {
      email: "admin@somma.com.br",
      name: "Paulo Vitor",
      password: adminPassword,
      role: "ADMIN",
      phone: "(11) 99999-0000",
    },
  });

  const corretor = await prisma.user.upsert({
    where: { email: "juliana@somma.com.br" },
    update: { password: sommaPassword, name: "Juliana Costa", role: "CORRETOR", phone: "(11) 98877-4455" },
    create: {
      email: "juliana@somma.com.br",
      name: "Juliana Costa",
      password: sommaPassword,
      role: "CORRETOR",
      phone: "(11) 98877-4455",
    },
  });

  const financeiro = await prisma.user.upsert({
    where: { email: "ricardo@somma.com.br" },
    update: { password: sommaPassword, name: "Ricardo Almeida", role: "FINANCEIRO", phone: "(11) 97766-3322" },
    create: {
      email: "ricardo@somma.com.br",
      name: "Ricardo Almeida",
      password: sommaPassword,
      role: "FINANCEIRO",
      phone: "(11) 97766-3322",
    },
  });

  console.log("Usuarios criados:", admin.email, corretor.email, financeiro.email);

  // ==========================================
  // PROPRIETARIOS
  // ==========================================
  const owner1 = await prisma.owner.create({
    data: {
      name: "Carlos Eduardo Mendes",
      email: "carlos.mendes@gmail.com",
      phone: "(11) 98765-4321",
      cpfCnpj: "341.578.926-04",
      personType: "PF",
      street: "Rua Augusta",
      number: "1200",
      complement: "Apto 82",
      neighborhood: "Consolacao",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01304-001",
      bankName: "Banco do Brasil",
      bankAgency: "1234-5",
      bankAccount: "56789-0",
      bankPix: "carlos.mendes@gmail.com",
      portalToken: "portal-carlos-2024",
      portalActive: true,
      notes: "Proprietario desde 2020. Possui 2 imoveis na carteira.",
    },
  });

  const owner2 = await prisma.owner.create({
    data: {
      name: "Maria Helena da Silva",
      email: "mhelena.silva@outlook.com",
      phone: "(11) 97654-3210",
      cpfCnpj: "892.145.673-51",
      personType: "PF",
      street: "Alameda Santos",
      number: "450",
      complement: "Cobertura",
      neighborhood: "Cerqueira Cesar",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01418-100",
      bankName: "Itau",
      bankAgency: "0347",
      bankAccount: "12890-3",
      bankPix: "mhelena.silva@outlook.com",
      notes: "Investidora imobiliaria. Prefere contato por WhatsApp.",
    },
  });

  const owner3 = await prisma.owner.create({
    data: {
      name: "Grupo Norte Investimentos Ltda",
      email: "contato@gruponorte.com.br",
      phone: "(11) 3456-7890",
      cpfCnpj: "18.432.567/0001-90",
      personType: "PJ",
      street: "Av. Brigadeiro Faria Lima",
      number: "3477",
      complement: "Sala 1201",
      neighborhood: "Itaim Bibi",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "04538-133",
      bankName: "Santander",
      bankAgency: "0658",
      bankAccount: "13002456-7",
      bankPix: "18432567000190",
      portalToken: "portal-norte-2024",
      portalActive: true,
      notes: "Empresa de investimentos imobiliarios. Gestora: Fernanda Rocha.",
    },
  });

  const owner4 = await prisma.owner.create({
    data: {
      name: "Roberto Fernandes de Lima",
      email: "roberto.flima@gmail.com",
      phone: "(19) 99812-5567",
      cpfCnpj: "456.203.891-72",
      personType: "PF",
      street: "Rua Barao de Jaguara",
      number: "900",
      complement: "Casa 3",
      neighborhood: "Centro",
      city: "Campinas",
      state: "SP",
      zipCode: "13015-001",
      bankName: "Bradesco",
      bankAgency: "2190",
      bankAccount: "78341-5",
      bankPix: "(19) 99812-5567",
      notes: "Possui imoveis em Campinas e SP. Aposentado.",
    },
  });

  console.log("Proprietarios criados: 4");

  // ==========================================
  // IMOVEIS (8 propriedades com fotos)
  // ==========================================

  // --- Property 1: Apartamento 302 - Ed. Solar da Vila (ALUGADO, owner1)
  const prop1 = await prisma.property.create({
    data: {
      title: "Apartamento 302 - Ed. Solar da Vila",
      description: "Apartamento amplo e bem iluminado, com varanda gourmet e vista para area verde do condominio. Piso em porcelanato, armarios planejados na cozinha e dormitorios.",
      type: "APARTAMENTO",
      status: "ALUGADO",
      street: "Rua das Acacias",
      number: "450",
      complement: "Bloco B, Apto 302",
      neighborhood: "Vila Mariana",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "04101-000",
      area: 85,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpaces: 1,
      rentalValue: 2500,
      condoFee: 450,
      iptuValue: 180,
      ownerId: owner1.id,
    },
  });
  await prisma.propertyPhoto.createMany({
    data: [
      { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop", caption: "Sala de estar", order: 0, propertyId: prop1.id },
      { url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop", caption: "Dormitorio principal", order: 1, propertyId: prop1.id },
      { url: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&h=600&fit=crop", caption: "Cozinha planejada", order: 2, propertyId: prop1.id },
    ],
  });

  // --- Property 2: Cobertura Duplex 1001 - Ed. Premium (ALUGADO, owner4)
  const prop2 = await prisma.property.create({
    data: {
      title: "Cobertura Duplex 1001 - Ed. Premium Jardins",
      description: "Cobertura duplex de alto padrao com piscina privativa, churrasqueira e vista panoramica. Acabamento premium com marmore importado e automacao residencial completa.",
      type: "APARTAMENTO",
      status: "ALUGADO",
      street: "Rua Oscar Freire",
      number: "1800",
      complement: "Cobertura 1001",
      neighborhood: "Jardins",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01426-001",
      area: 180,
      bedrooms: 4,
      bathrooms: 3,
      parkingSpaces: 3,
      furnished: true,
      rentalValue: 8500,
      condoFee: 1800,
      iptuValue: 650,
      ownerId: owner4.id,
    },
  });
  await prisma.propertyPhoto.createMany({
    data: [
      { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop", caption: "Sala de estar integrada", order: 0, propertyId: prop2.id },
      { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop", caption: "Living amplo", order: 1, propertyId: prop2.id },
      { url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop", caption: "Suite master", order: 2, propertyId: prop2.id },
    ],
  });

  // --- Property 3: Sala Comercial 501 - Ed. Central Business (ALUGADO, owner3)
  const prop3 = await prisma.property.create({
    data: {
      title: "Sala Comercial 501 - Ed. Central Business",
      description: "Sala comercial moderna em predio corporativo AAA na Av. Paulista. Infraestrutura completa com ar-condicionado central, piso elevado e cabeamento estruturado.",
      type: "COMERCIAL",
      status: "ALUGADO",
      street: "Av. Paulista",
      number: "1200",
      complement: "Sala 501",
      neighborhood: "Bela Vista",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01310-100",
      area: 60,
      bedrooms: 0,
      bathrooms: 1,
      parkingSpaces: 0,
      rentalValue: 4200,
      condoFee: 800,
      iptuValue: 320,
      ownerId: owner3.id,
    },
  });
  await prisma.propertyPhoto.createMany({
    data: [
      { url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop", caption: "Escritorio moderno", order: 0, propertyId: prop3.id },
      { url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&h=600&fit=crop", caption: "Espaco de trabalho", order: 1, propertyId: prop3.id },
    ],
  });

  // --- Property 4: Casa Alto Padrao - Rua das Flores (DISPONIVEL, owner2)
  const prop4 = await prisma.property.create({
    data: {
      title: "Casa Alto Padrao - Rua das Flores",
      description: "Casa em condominio fechado com projeto arquitetonico contemporaneo. Amplo jardim, piscina aquecida, espaco gourmet e home office. Seguranca 24h.",
      type: "CASA",
      status: "DISPONIVEL",
      street: "Rua das Flores",
      number: "150",
      complement: "Cond. Jardins do Lago, Casa 12",
      neighborhood: "Jardim Europa",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "04562-000",
      area: 220,
      bedrooms: 4,
      bathrooms: 3,
      parkingSpaces: 3,
      rentalValue: 6800,
      iptuValue: 520,
      ownerId: owner2.id,
    },
  });
  await prisma.propertyPhoto.createMany({
    data: [
      { url: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop", caption: "Fachada da casa", order: 0, propertyId: prop4.id },
      { url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop", caption: "Entrada principal", order: 1, propertyId: prop4.id },
      { url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop", caption: "Area de lazer com piscina", order: 2, propertyId: prop4.id },
    ],
  });

  // --- Property 5: Apartamento 102 - Ed. Mirante do Mar (DISPONIVEL, owner2)
  const prop5 = await prisma.property.create({
    data: {
      title: "Apartamento 102 - Ed. Mirante do Mar",
      description: "Apartamento com vista para o mar em Santos. Recém reformado, com varanda ampla e infraestrutura de lazer completa no condominio. Ideal para locacao de temporada ou residencial.",
      type: "APARTAMENTO",
      status: "DISPONIVEL",
      street: "Av. Beira Mar",
      number: "800",
      complement: "Apto 102",
      neighborhood: "Gonzaga",
      city: "Santos",
      state: "SP",
      zipCode: "11060-000",
      area: 95,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpaces: 1,
      rentalValue: 3100,
      condoFee: 550,
      iptuValue: 200,
      ownerId: owner2.id,
    },
  });
  await prisma.propertyPhoto.createMany({
    data: [
      { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop", caption: "Sala com vista para o mar", order: 0, propertyId: prop5.id },
      { url: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&h=600&fit=crop", caption: "Cozinha americana", order: 1, propertyId: prop5.id },
    ],
  });

  // --- Property 6: Loja 3 - Galeria Norte (ALUGADO, owner3)
  const prop6 = await prisma.property.create({
    data: {
      title: "Loja 3 - Galeria Norte Shopping",
      description: "Loja em galeria comercial de alto fluxo na regiao central. Vitrine ampla, mezanino e deposito nos fundos. Excelente para restaurante ou varejo.",
      type: "COMERCIAL",
      status: "ALUGADO",
      street: "Rua do Comercio",
      number: "300",
      complement: "Loja 3",
      neighborhood: "Centro",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01013-000",
      area: 45,
      bedrooms: 0,
      bathrooms: 1,
      parkingSpaces: 0,
      rentalValue: 5500,
      condoFee: 350,
      iptuValue: 280,
      ownerId: owner3.id,
    },
  });
  await prisma.propertyPhoto.createMany({
    data: [
      { url: "https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=800&h=600&fit=crop", caption: "Fachada da loja", order: 0, propertyId: prop6.id },
      { url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop", caption: "Interior da loja", order: 1, propertyId: prop6.id },
    ],
  });

  // --- Property 7: Apartamento 405 - Ed. Jardins (MANUTENCAO, owner1)
  const prop7 = await prisma.property.create({
    data: {
      title: "Apartamento 405 - Ed. Jardins Paulista",
      description: "Apartamento compacto e funcional, ideal para jovens profissionais. Atualmente em manutencao para reforma de banheiro e pintura geral.",
      type: "APARTAMENTO",
      status: "MANUTENCAO",
      street: "Rua Pamplona",
      number: "720",
      complement: "Apto 405",
      neighborhood: "Jardim Paulista",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01405-001",
      area: 72,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: 1,
      rentalValue: 2200,
      condoFee: 380,
      iptuValue: 150,
      ownerId: owner1.id,
      notes: "Em reforma - previsao de conclusao: Abril/2026",
    },
  });
  await prisma.propertyPhoto.createMany({
    data: [
      { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop", caption: "Sala de estar", order: 0, propertyId: prop7.id },
      { url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop", caption: "Dormitorio", order: 1, propertyId: prop7.id },
    ],
  });

  // --- Property 8: Pavilhao Industrial - Rod. Anchieta (DISPONIVEL, owner4)
  const prop8 = await prisma.property.create({
    data: {
      title: "Pavilhao Industrial - Rod. Anchieta Km 25",
      description: "Pavilhao industrial com pe-direito de 10m, piso de alta resistencia, docas para carga/descarga e escritorio administrativo. Localizacao estrategica com acesso direto a rodovia.",
      type: "PAVILHAO",
      status: "DISPONIVEL",
      street: "Rodovia Anchieta",
      number: "Km 25",
      complement: "Pavilhao 4",
      neighborhood: "Distrito Industrial",
      city: "Sao Bernardo do Campo",
      state: "SP",
      zipCode: "09852-000",
      area: 500,
      bedrooms: 0,
      bathrooms: 2,
      parkingSpaces: 5,
      rentalValue: 12000,
      iptuValue: 890,
      ownerId: owner4.id,
    },
  });
  await prisma.propertyPhoto.createMany({
    data: [
      { url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop", caption: "Area interna do pavilhao", order: 0, propertyId: prop8.id },
      { url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&h=600&fit=crop", caption: "Escritorio administrativo", order: 1, propertyId: prop8.id },
      { url: "https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=800&h=600&fit=crop", caption: "Entrada do pavilhao", order: 2, propertyId: prop8.id },
    ],
  });

  console.log("Imoveis criados: 8 (com fotos)");

  // ==========================================
  // LOCATARIOS (5 inquilinos)
  // ==========================================

  const tenant1 = await prisma.tenant.create({
    data: {
      name: "Ana Carolina Oliveira",
      email: "ana.oliveira@gmail.com",
      phone: "(11) 97654-3210",
      cpfCnpj: "298.461.538-07",
      personType: "PF",
      street: "Rua Vergueiro",
      number: "1500",
      neighborhood: "Liberdade",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01504-001",
      rgNumber: "34.567.890-X",
      occupation: "Engenheira Civil",
      monthlyIncome: 12000,
      notes: "Locataria pontual. Moradora desde Jan/2025.",
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      name: "Tech Solutions Ltda",
      email: "financeiro@techsolutions.com.br",
      phone: "(11) 3456-7890",
      cpfCnpj: "32.891.456/0001-10",
      personType: "PJ",
      street: "Rua Funchal",
      number: "411",
      complement: "Conj 51",
      neighborhood: "Vila Olimpia",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "04551-060",
      occupation: "Empresa de Tecnologia",
      notes: "Startup de software. Responsavel: Marcos Vieira (CEO).",
    },
  });

  const tenant3 = await prisma.tenant.create({
    data: {
      name: "Restaurante Sabor & Arte Ltda",
      email: "administrativo@saborarte.com.br",
      phone: "(11) 2345-6789",
      cpfCnpj: "45.678.901/0001-23",
      personType: "PJ",
      street: "Rua da Consolacao",
      number: "1800",
      neighborhood: "Consolacao",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01302-001",
      occupation: "Restaurante",
      notes: "Restaurante italiano premiado. Responsavel: Chef Lorenzo Mancini.",
    },
  });

  const tenant4 = await prisma.tenant.create({
    data: {
      name: "Pedro Henrique Santos",
      email: "pedro.santos@usp.br",
      phone: "(11) 98234-5678",
      cpfCnpj: "512.347.896-63",
      personType: "PF",
      street: "Rua Dr. Arnaldo",
      number: "455",
      neighborhood: "Cerqueira Cesar",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01246-903",
      rgNumber: "45.678.901-2",
      occupation: "Medico Cardiologista",
      monthlyIncome: 18000,
      notes: "Professor da USP e medico no Hospital das Clinicas.",
    },
  });

  const tenant5 = await prisma.tenant.create({
    data: {
      name: "StartUp Digital Ltda",
      email: "contato@startupdigital.io",
      phone: "(11) 91234-5678",
      cpfCnpj: "56.789.012/0001-34",
      personType: "PJ",
      street: "Rua Gomes de Carvalho",
      number: "1666",
      complement: "Andar 3",
      neighborhood: "Vila Olimpia",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "04547-006",
      occupation: "Empresa de Marketing Digital",
      notes: "Agencia de marketing digital. Responsavel: Camila Ferreira (COO).",
    },
  });

  console.log("Locatarios criados: 5");

  // ==========================================
  // CONTRATOS (5 contratos)
  // ==========================================

  // CTR-2024-001: Prop1 (Apt 302), tenant1, ATIVO, R$2.500, 10% admin
  const ctr1 = await prisma.contract.create({
    data: {
      code: "CTR-2024-001",
      type: "LOCACAO",
      status: "ATIVO",
      propertyId: prop1.id,
      ownerId: owner1.id,
      tenantId: tenant1.id,
      rentalValue: 2500,
      adminFeePercent: 10,
      startDate: new Date("2025-01-01"),
      endDate: new Date("2027-01-01"),
      paymentDay: 5,
      guaranteeType: "FIADOR",
      guaranteeNotes: "Fiador: Jose Roberto Oliveira (pai). CPF: 123.456.789-00",
      adjustmentIndex: "IGPM",
      adjustmentMonth: 1,
      notes: "Contrato residencial padrao 24 meses. Renovacao automatica.",
    },
  });

  // CTR-2024-002: Prop3 (Sala 501), tenant2, ATIVO, R$4.200, 10% admin
  const ctr2 = await prisma.contract.create({
    data: {
      code: "CTR-2024-002",
      type: "LOCACAO",
      status: "ATIVO",
      propertyId: prop3.id,
      ownerId: owner3.id,
      tenantId: tenant2.id,
      rentalValue: 4200,
      adminFeePercent: 10,
      startDate: new Date("2025-03-15"),
      endDate: new Date("2027-03-15"),
      paymentDay: 1,
      guaranteeType: "CAUCAO",
      guaranteeValue: 12600,
      guaranteeNotes: "Caucao de 3 meses depositada em 15/03/2025.",
      adjustmentIndex: "IPCA",
      adjustmentMonth: 3,
      notes: "Contrato comercial. Permitido uso como escritorio de TI.",
    },
  });

  // CTR-2025-003: Prop6 (Loja 3), tenant3, ATIVO, R$5.500, 10% admin
  const ctr3 = await prisma.contract.create({
    data: {
      code: "CTR-2025-003",
      type: "LOCACAO",
      status: "ATIVO",
      propertyId: prop6.id,
      ownerId: owner3.id,
      tenantId: tenant3.id,
      rentalValue: 5500,
      adminFeePercent: 10,
      startDate: new Date("2025-06-01"),
      endDate: new Date("2027-06-01"),
      paymentDay: 15,
      guaranteeType: "SEGURO_FIANCA",
      guaranteeNotes: "Seguro fianca Porto Seguro - Apolice #SF-2025-78901",
      adjustmentIndex: "IGPM",
      adjustmentMonth: 6,
      notes: "Contrato comercial para restaurante. Alvara de funcionamento em dia.",
    },
  });

  // CTR-2025-004: Prop2 (Cobertura), tenant4, ATIVO, R$8.500, 8% admin
  const ctr4 = await prisma.contract.create({
    data: {
      code: "CTR-2025-004",
      type: "LOCACAO",
      status: "ATIVO",
      propertyId: prop2.id,
      ownerId: owner4.id,
      tenantId: tenant4.id,
      rentalValue: 8500,
      adminFeePercent: 8,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2028-01-01"),
      paymentDay: 10,
      guaranteeType: "TITULO_CAPITALIZACAO",
      guaranteeValue: 25500,
      guaranteeNotes: "Titulo de capitalizacao Bradesco - 3x aluguel.",
      adjustmentIndex: "IPCA",
      adjustmentMonth: 1,
      notes: "Contrato alto padrao com taxa de administracao diferenciada de 8%.",
    },
  });

  // CTR-2023-005: Prop1 (old contract), tenant1, ENCERRADO
  const ctr5 = await prisma.contract.create({
    data: {
      code: "CTR-2023-005",
      type: "LOCACAO",
      status: "ENCERRADO",
      propertyId: prop1.id,
      ownerId: owner1.id,
      tenantId: tenant1.id,
      rentalValue: 2200,
      adminFeePercent: 10,
      startDate: new Date("2023-01-01"),
      endDate: new Date("2024-12-31"),
      paymentDay: 5,
      guaranteeType: "FIADOR",
      adjustmentIndex: "IGPM",
      adjustmentMonth: 1,
      notes: "Contrato encerrado. Renovado como CTR-2024-001 com reajuste.",
    },
  });

  console.log("Contratos criados: 5");

  // ==========================================
  // PAGAMENTOS (12 - 3 meses de dados)
  // ==========================================

  // --- Janeiro/2026 ---
  const pag1 = await prisma.payment.create({
    data: {
      code: "PAG-2026-001",
      contractId: ctr1.id,
      tenantId: tenant1.id,
      ownerId: owner1.id,
      value: 2500,
      paidValue: 2500,
      dueDate: new Date("2026-01-05"),
      paidAt: new Date("2026-01-04"),
      status: "PAGO",
      paymentMethod: "PIX",
      splitOwnerValue: 2250,
      splitAdminValue: 250,
      description: "Aluguel Janeiro/2026 - Apt 302 Ed. Solar da Vila",
    },
  });

  const pag2 = await prisma.payment.create({
    data: {
      code: "PAG-2026-002",
      contractId: ctr2.id,
      tenantId: tenant2.id,
      ownerId: owner3.id,
      value: 4200,
      paidValue: 4200,
      dueDate: new Date("2026-01-01"),
      paidAt: new Date("2026-01-02"),
      status: "PAGO",
      paymentMethod: "BOLETO",
      splitOwnerValue: 3780,
      splitAdminValue: 420,
      description: "Aluguel Janeiro/2026 - Sala 501 Ed. Central Business",
    },
  });

  const pag3 = await prisma.payment.create({
    data: {
      code: "PAG-2026-003",
      contractId: ctr3.id,
      tenantId: tenant3.id,
      ownerId: owner3.id,
      value: 5500,
      paidValue: 5500,
      dueDate: new Date("2026-01-15"),
      paidAt: new Date("2026-01-16"),
      status: "PAGO",
      paymentMethod: "TRANSFERENCIA",
      splitOwnerValue: 4950,
      splitAdminValue: 550,
      description: "Aluguel Janeiro/2026 - Loja 3 Galeria Norte",
    },
  });

  const pag4 = await prisma.payment.create({
    data: {
      code: "PAG-2026-004",
      contractId: ctr4.id,
      tenantId: tenant4.id,
      ownerId: owner4.id,
      value: 8500,
      paidValue: 8500,
      dueDate: new Date("2026-01-10"),
      paidAt: new Date("2026-01-10"),
      status: "PAGO",
      paymentMethod: "PIX",
      splitOwnerValue: 7820,
      splitAdminValue: 680,
      description: "Aluguel Janeiro/2026 - Cobertura 1001 Ed. Premium",
    },
  });

  // --- Fevereiro/2026 ---
  const pag5 = await prisma.payment.create({
    data: {
      code: "PAG-2026-005",
      contractId: ctr1.id,
      tenantId: tenant1.id,
      ownerId: owner1.id,
      value: 2500,
      paidValue: 2500,
      dueDate: new Date("2026-02-05"),
      paidAt: new Date("2026-02-05"),
      status: "PAGO",
      paymentMethod: "PIX",
      splitOwnerValue: 2250,
      splitAdminValue: 250,
      description: "Aluguel Fevereiro/2026 - Apt 302 Ed. Solar da Vila",
    },
  });

  const pag6 = await prisma.payment.create({
    data: {
      code: "PAG-2026-006",
      contractId: ctr2.id,
      tenantId: tenant2.id,
      ownerId: owner3.id,
      value: 4200,
      paidValue: 4200,
      dueDate: new Date("2026-02-01"),
      paidAt: new Date("2026-02-01"),
      status: "PAGO",
      paymentMethod: "BOLETO",
      splitOwnerValue: 3780,
      splitAdminValue: 420,
      description: "Aluguel Fevereiro/2026 - Sala 501 Ed. Central Business",
    },
  });

  const pag7 = await prisma.payment.create({
    data: {
      code: "PAG-2026-007",
      contractId: ctr3.id,
      tenantId: tenant3.id,
      ownerId: owner3.id,
      value: 5500,
      paidValue: 5500,
      dueDate: new Date("2026-02-15"),
      paidAt: new Date("2026-02-14"),
      status: "PAGO",
      paymentMethod: "TRANSFERENCIA",
      splitOwnerValue: 4950,
      splitAdminValue: 550,
      description: "Aluguel Fevereiro/2026 - Loja 3 Galeria Norte",
    },
  });

  const pag8 = await prisma.payment.create({
    data: {
      code: "PAG-2026-008",
      contractId: ctr4.id,
      tenantId: tenant4.id,
      ownerId: owner4.id,
      value: 8500,
      paidValue: 8500,
      dueDate: new Date("2026-02-10"),
      paidAt: new Date("2026-02-10"),
      status: "PAGO",
      paymentMethod: "PIX",
      splitOwnerValue: 7820,
      splitAdminValue: 680,
      description: "Aluguel Fevereiro/2026 - Cobertura 1001 Ed. Premium",
    },
  });

  // --- Marco/2026 (mes atual) ---
  const pag9 = await prisma.payment.create({
    data: {
      code: "PAG-2026-009",
      contractId: ctr1.id,
      tenantId: tenant1.id,
      ownerId: owner1.id,
      value: 2500,
      paidValue: 2500,
      dueDate: new Date("2026-03-05"),
      paidAt: new Date("2026-03-04"),
      status: "PAGO",
      paymentMethod: "PIX",
      splitOwnerValue: 2250,
      splitAdminValue: 250,
      description: "Aluguel Marco/2026 - Apt 302 Ed. Solar da Vila",
    },
  });

  const pag10 = await prisma.payment.create({
    data: {
      code: "PAG-2026-010",
      contractId: ctr2.id,
      tenantId: tenant2.id,
      ownerId: owner3.id,
      value: 4200,
      dueDate: new Date("2026-03-01"),
      status: "ATRASADO",
      description: "Aluguel Marco/2026 - Sala 501 Ed. Central Business",
      notes: "Locatario informou atraso por questoes de fluxo de caixa. Cobrar multa e juros.",
    },
  });

  const pag11 = await prisma.payment.create({
    data: {
      code: "PAG-2026-011",
      contractId: ctr3.id,
      tenantId: tenant3.id,
      ownerId: owner3.id,
      value: 5500,
      dueDate: new Date("2026-03-15"),
      status: "PENDENTE",
      description: "Aluguel Marco/2026 - Loja 3 Galeria Norte",
    },
  });

  const pag12 = await prisma.payment.create({
    data: {
      code: "PAG-2026-012",
      contractId: ctr4.id,
      tenantId: tenant4.id,
      ownerId: owner4.id,
      value: 8500,
      paidValue: 8500,
      dueDate: new Date("2026-03-10"),
      paidAt: new Date("2026-03-10"),
      status: "PAGO",
      paymentMethod: "TRANSFERENCIA",
      splitOwnerValue: 7820,
      splitAdminValue: 680,
      description: "Aluguel Marco/2026 - Cobertura 1001 Ed. Premium",
    },
  });

  console.log("Pagamentos criados: 12");

  // ==========================================
  // NOTIFICACOES
  // ==========================================
  const now = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
  const fourDaysAgo = new Date(Date.now() - 4 * 86400000);
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);
  const threeWeeksAgo = new Date(Date.now() - 21 * 86400000);

  await prisma.notification.createMany({
    data: [
      {
        id: "c_notif_001", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Tech Solutions Ltda", recipientPhone: "(11) 3456-7890", recipientEmail: "financeiro@techsolutions.com.br",
        templateKey: "payment_overdue", message: "Prezado(a) Tech Solutions Ltda, identificamos que o pagamento do aluguel referente a Marco/2026 no valor de R$ 4.200,00 com vencimento em 01/03/2026 encontra-se em atraso. Por favor, regularize o quanto antes para evitar multa e juros. Em caso de duvidas, entre em contato com a Somma Imoveis.",
        status: "ENVIADO", sentAt: twoDaysAgo, paymentId: pag10.id, contractId: ctr2.id, tenantId: tenant2.id, ownerId: owner3.id, createdAt: twoDaysAgo, updatedAt: twoDaysAgo,
      },
      {
        id: "c_notif_002", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Restaurante Sabor & Arte Ltda", recipientPhone: "(11) 2345-6789", recipientEmail: "administrativo@saborarte.com.br",
        templateKey: "payment_reminder", message: "Prezado(a) Restaurante Sabor & Arte Ltda, lembramos que o aluguel referente a Marco/2026 no valor de R$ 5.500,00 vence em 15/03/2026. Mantenha seu pagamento em dia! Somma Imoveis agradece.",
        status: "ENVIADO", sentAt: threeDaysAgo, paymentId: pag11.id, contractId: ctr3.id, tenantId: tenant3.id, ownerId: owner3.id, createdAt: threeDaysAgo, updatedAt: threeDaysAgo,
      },
      {
        id: "c_notif_003", type: "EMAIL", channel: "email",
        recipientName: "Carlos Eduardo Mendes", recipientPhone: "(11) 98765-4321", recipientEmail: "carlos.mendes@gmail.com",
        templateKey: "payment_received", subject: "Pagamento Recebido - Apt 302 Ed. Solar da Vila", message: "Prezado Carlos Eduardo, informamos que o pagamento do aluguel de Marco/2026 do imovel Apt 302 - Ed. Solar da Vila foi recebido em 04/03/2026 no valor de R$ 2.500,00 via PIX. O repasse de R$ 2.250,00 sera creditado em sua conta em ate 5 dias uteis. Atenciosamente, Somma Imoveis.",
        status: "ENVIADO", sentAt: yesterday, paymentId: pag9.id, contractId: ctr1.id, tenantId: tenant1.id, ownerId: owner1.id, createdAt: yesterday, updatedAt: yesterday,
      },
      {
        id: "c_notif_004", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Ana Carolina Oliveira", recipientPhone: "(11) 97654-3210", recipientEmail: "ana.oliveira@gmail.com",
        templateKey: "payment_confirmed", message: "Ola Ana Carolina! Confirmamos o recebimento do seu pagamento de R$ 2.500,00 referente ao aluguel de Marco/2026 do Apt 302 - Ed. Solar da Vila. Obrigado pela pontualidade! Somma Imoveis.",
        status: "ENVIADO", sentAt: yesterday, paymentId: pag9.id, contractId: ctr1.id, tenantId: tenant1.id, ownerId: owner1.id, createdAt: yesterday, updatedAt: yesterday,
      },
      {
        id: "c_notif_005", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Tech Solutions Ltda", recipientPhone: "(11) 3456-7890", recipientEmail: "financeiro@techsolutions.com.br",
        templateKey: "payment_overdue_second", message: "URGENTE - Tech Solutions Ltda, o pagamento do aluguel de Marco/2026 no valor de R$ 4.200,00 esta com 15 dias de atraso. Multa de 2% e juros de 1% ao mes serao aplicados conforme contrato. Entre em contato imediatamente para regularizacao. Somma Imoveis - (11) 99999-0000.",
        status: "PENDENTE", paymentId: pag10.id, contractId: ctr2.id, tenantId: tenant2.id, ownerId: owner3.id, createdAt: now, updatedAt: now,
      },
      {
        id: "c_notif_006", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Pedro Henrique Santos", recipientPhone: "(11) 98234-5678", recipientEmail: "pedro.santos@email.com",
        templateKey: "payment_reminder", message: "Prezado(a) Pedro Henrique, lembramos que o aluguel referente a Marco/2026 no valor de R$ 2.200,00 vence em 10/03/2026. Mantenha seu pagamento em dia! Somma Imoveis agradece.",
        status: "ENVIADO", sentAt: oneWeekAgo, paymentId: pag12.id, contractId: ctr4.id, tenantId: tenant4.id, ownerId: owner1.id, createdAt: oneWeekAgo, updatedAt: oneWeekAgo,
      },
      {
        id: "c_notif_007", type: "EMAIL", channel: "email",
        recipientName: "Maria Helena da Silva", recipientPhone: "(11) 99887-6543", recipientEmail: "maria.helena@gmail.com",
        templateKey: "owner_payment_received", subject: "Repasse Realizado - Casa Rua das Flores", message: "Prezada Maria Helena, informamos que o repasse de R$ 6.120,00 referente ao aluguel de Fevereiro/2026 do imovel Casa Alto Padrao - Rua das Flores foi creditado em sua conta. Atenciosamente, Somma Imoveis.",
        status: "ENVIADO", sentAt: twoWeeksAgo, paymentId: pag5.id, contractId: ctr5.id, tenantId: tenant5.id, ownerId: owner2.id, createdAt: twoWeeksAgo, updatedAt: twoWeeksAgo,
      },
      {
        id: "c_notif_008", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "StartUp Digital Ltda", recipientPhone: "(11) 91234-5678", recipientEmail: "contato@startupdigital.com.br",
        templateKey: "contract_expiring", message: "Prezado(a) StartUp Digital Ltda, informamos que seu contrato de locacao do imovel Apartamento 405 - Ed. Jardins Paulista vence em 30 dias (15/04/2026). Entre em contato para renovacao. Somma Imoveis.",
        status: "ENVIADO", sentAt: fiveDaysAgo, contractId: ctr4.id, tenantId: tenant4.id, ownerId: owner1.id, createdAt: fiveDaysAgo, updatedAt: fiveDaysAgo,
      },
      {
        id: "c_notif_009", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Ana Carolina Oliveira", recipientPhone: "(11) 97654-3210", recipientEmail: "ana.oliveira@gmail.com",
        templateKey: "payment_reminder", message: "Prezado(a) Ana Carolina, lembramos que o aluguel referente a Marco/2026 no valor de R$ 3.100,00 vence em 10/03/2026. Mantenha seu pagamento em dia! Somma Imoveis agradece.",
        status: "ENVIADO", sentAt: fourDaysAgo, paymentId: pag7.id, contractId: ctr1.id, tenantId: tenant1.id, ownerId: owner2.id, createdAt: fourDaysAgo, updatedAt: fourDaysAgo,
      },
      {
        id: "c_notif_010", type: "EMAIL", channel: "email",
        recipientName: "Grupo Norte Investimentos Ltda", recipientPhone: "(11) 3333-4444", recipientEmail: "contato@gruponorte.com.br",
        templateKey: "owner_payment_received", subject: "Repasse Realizado - Loja 3 Galeria Norte", message: "Prezado Grupo Norte Investimentos, informamos que o repasse referente ao aluguel de Fevereiro/2026 foi processado.",
        status: "FALHA", errorMessage: "Erro SMTP: caixa de email cheia (quota exceeded)", paymentId: pag4.id, contractId: ctr3.id, tenantId: tenant3.id, ownerId: owner3.id, createdAt: threeWeeksAgo, updatedAt: threeWeeksAgo,
      },
      {
        id: "c_notif_011", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Grupo Norte Investimentos Ltda", recipientPhone: "(11) 3333-4444", recipientEmail: "contato@gruponorte.com.br",
        templateKey: "owner_payment_overdue", message: "Prezado(a) Grupo Norte Investimentos, informamos que o pagamento do locatario Tech Solutions Ltda referente ao imovel Sala 501 - Ed. Central Business encontra-se em atraso desde 01/03/2026. Estamos tomando as providencias para regularizacao. Somma Imoveis.",
        status: "ENVIADO", sentAt: twoDaysAgo, paymentId: pag10.id, contractId: ctr2.id, tenantId: tenant2.id, ownerId: owner3.id, createdAt: twoDaysAgo, updatedAt: twoDaysAgo,
      },
      {
        id: "c_notif_012", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Restaurante Sabor & Arte Ltda", recipientPhone: "(11) 2345-6789", recipientEmail: "administrativo@saborarte.com.br",
        templateKey: "payment_reminder", message: "Prezado(a) Restaurante Sabor & Arte Ltda, lembramos que o aluguel referente a Abril/2026 no valor de R$ 5.500,00 vence em 15/04/2026. Mantenha seu pagamento em dia! Somma Imoveis agradece.",
        status: "PENDENTE", paymentId: pag11.id, contractId: ctr3.id, tenantId: tenant3.id, ownerId: owner3.id, createdAt: now, updatedAt: now,
      },
      {
        id: "c_notif_013", type: "EMAIL", channel: "email",
        recipientName: "Pedro Henrique Santos", recipientPhone: "(11) 98234-5678", recipientEmail: "pedro.santos@email.com",
        templateKey: "payment_received", subject: "Pagamento Confirmado - Apt 405 Ed. Jardins", message: "Prezado Pedro Henrique, confirmamos o recebimento do pagamento de R$ 2.200,00 referente ao aluguel de Fevereiro/2026 do Apartamento 405 - Ed. Jardins Paulista. Obrigado! Somma Imoveis.",
        status: "ENVIADO", sentAt: twoWeeksAgo, paymentId: pag12.id, contractId: ctr4.id, tenantId: tenant4.id, ownerId: owner1.id, createdAt: twoWeeksAgo, updatedAt: twoWeeksAgo,
      },
      {
        id: "c_notif_014", type: "WHATSAPP", channel: "whatsapp",
        recipientName: "Ana Carolina Oliveira", recipientPhone: "(11) 97654-3210", recipientEmail: "ana.oliveira@gmail.com",
        templateKey: "payment_overdue", message: "Prezado(a) Ana Carolina Oliveira, identificamos que o pagamento do aluguel referente a Abril/2026 no valor de R$ 3.100,00 encontra-se em atraso. Por favor, regularize o pagamento para evitar multa e juros. Somma Imoveis.",
        status: "PENDENTE", paymentId: pag7.id, contractId: ctr1.id, tenantId: tenant1.id, ownerId: owner2.id, createdAt: now, updatedAt: now,
      },
      {
        id: "c_notif_015", type: "EMAIL", channel: "email",
        recipientName: "Roberto Fernandes de Lima", recipientPhone: "(11) 91122-3344", recipientEmail: "roberto.lima@outlook.com",
        templateKey: "owner_payment_received", subject: "Repasse Realizado - Galpao Industrial", message: "Prezado Roberto Fernandes, informamos que o repasse de R$ 10.800,00 referente ao aluguel de Marco/2026 do Galpao Industrial - Rod. Anchieta foi creditado em sua conta. Atenciosamente, Somma Imoveis.",
        status: "ENVIADO", sentAt: yesterday, paymentId: pag6.id, contractId: ctr5.id, tenantId: tenant5.id, ownerId: owner4.id, createdAt: yesterday, updatedAt: yesterday,
      },
    ],
  });

  console.log("Notificacoes criadas: 15");

  // ==========================================
  // RESUMO FINAL
  // ==========================================
  console.log("\n========================================");
  console.log("  Somma Imoveis - Seed Completo!");
  console.log("========================================");
  console.log("  Usuarios:       3 (Admin, Corretor, Financeiro)");
  console.log("  Proprietarios:  4 (3 PF + 1 PJ)");
  console.log("  Imoveis:        8 (com fotos)");
  console.log("  Locatarios:     5 (2 PF + 3 PJ)");
  console.log("  Contratos:      5 (4 ativos + 1 encerrado)");
  console.log("  Pagamentos:     12 (3 meses)");
  console.log("  Notificacoes:   5");
  console.log("========================================");
  console.log("\n  Logins disponiveis:");
  console.log("  admin@somma.com.br    / admin123  (ADMIN)");
  console.log("  juliana@somma.com.br  / somma123  (CORRETOR)");
  console.log("  ricardo@somma.com.br  / somma123  (FINANCEIRO)");
  console.log("========================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
