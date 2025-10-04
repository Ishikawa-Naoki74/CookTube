const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('Creating test user...');
    
    // Check if test user already exists
    const existingUser = await prisma.user.findUnique({
      where: { id: 'mock-guest-user' }
    });

    if (existingUser) {
      console.log('✅ Test user already exists:', existingUser.email);
      return;
    }

    // Create the test user that matches the auth middleware
    const user = await prisma.user.create({
      data: {
        id: 'mock-guest-user',
        email: 'guest@test.com',
        name: 'Test Guest User',
        isGuest: true,
      },
    });

    console.log('✅ Test user created successfully:', user.email);
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();