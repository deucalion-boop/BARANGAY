// Simple test script to verify inventory functionality
const mongoose = require('mongoose');
const Inventory = require('./models/inventory');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/community_portal', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected for testing');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Test inventory functionality
async function testInventory() {
  try {
    await connectDB();

    // Create a test inventory item
    const testItem = new Inventory({
      itemId: 'TEST-001',
      itemName: 'Test Medication',
      category: 'medication',
      location: 'pharmacy',
      currentStock: 100,
      reorderPoint: 20,
      expirationDate: new Date('2025-12-31'),
      supplier: 'Test Supplier',
      unitPrice: 5.99,
      description: 'Test medication for inventory system',
      createdBy: new mongoose.Types.ObjectId() // Dummy admin ID
    });

    await testItem.save();
    console.log('✅ Test item created successfully:', testItem.itemName);

    // Test stock status calculation
    console.log('📊 Stock status:', testItem.stockStatus);
    console.log('📅 Expiration status:', testItem.expirationStatus);

    // Test updating stock
    testItem.currentStock = 15; // Below reorder point
    await testItem.save();
    console.log('📉 Updated stock to 15, new status:', testItem.status);

    // Test finding items
    const lowStockItems = await Inventory.find({ 
      $or: [
        { status: 'critical-stock' },
        { currentStock: { $lte: 5 } }
      ]
    });
    console.log('⚠️ Low stock items found:', lowStockItems.length);

    // Test statistics
    const stats = await Inventory.aggregate([
      { $match: { isActive: true } },
      { $group: { 
        _id: null, 
        totalValue: { 
          $sum: { 
            $multiply: ['$currentStock', '$unitPrice'] 
          } 
        },
        totalItems: { $sum: 1 }
      }}
    ]);
    console.log('📈 Inventory statistics:', stats[0]);

    // Clean up test data
    await Inventory.deleteOne({ itemId: 'TEST-001' });
    console.log('🧹 Test data cleaned up');

    console.log('\n🎉 All inventory tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testInventory();
