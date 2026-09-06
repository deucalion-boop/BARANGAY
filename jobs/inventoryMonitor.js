const Inventory = require('../models/inventory');
const { broadcast } = require('../utils/realtime');

class InventoryMonitor {
  constructor() {
    this.checkInterval = 60 * 60 * 1000; // Check every hour
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('Inventory monitor is already running');
      return;
    }

    console.log('Starting inventory monitor...');
    this.isRunning = true;

    // Run initial check
    this.checkInventory();

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.checkInventory();
    }, this.checkInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Inventory monitor stopped');
  }

  async checkInventory() {
    try {
      console.log('Checking inventory for status updates...');

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Find items that need status updates
      const items = await Inventory.find({ isActive: true });

      let updatedCount = 0;

      for (const item of items) {
        let needsUpdate = false;
        const oldStatus = item.status;

        // Check expiration status
        if (item.expirationDate) {
          const expDate = new Date(item.expirationDate);

          if (expDate < now && item.status !== 'expired') {
            item.status = 'expired';
            needsUpdate = true;
          } else if (expDate <= thirtyDaysFromNow && expDate >= now && item.status !== 'expired') {
            // Keep current status unless it was expired
            // This allows other status logic to take precedence
          }
        }

        // Check stock status
        let stockStatus = 'in-stock';
        if (item.currentStock === 0) {
          stockStatus = 'out-of-stock';
        } else if (item.currentStock <= item.reorderPoint * 0.5) {
          stockStatus = 'critical-stock';
        } else if (item.currentStock <= item.reorderPoint) {
          stockStatus = 'low-stock';
        }

        // Update status if stock status is more critical than current status
        const statusPriority = {
          'expired': 5,
          'out-of-stock': 4,
          'critical-stock': 3,
          'low-stock': 2,
          'in-stock': 1
        };

        if (statusPriority[stockStatus] > statusPriority[item.status] ||
            (item.status === 'expired' && stockStatus !== 'in-stock')) {
          item.status = stockStatus;
          needsUpdate = true;
        }

        // Save if needed
        if (needsUpdate) {
          item.lastUpdated = new Date();
          await item.save();

          updatedCount++;

          // Broadcast update to connected clients
          const updatedItem = await Inventory.findById(item._id)
            .populate('createdBy', 'firstName lastName');

          broadcast('inventory_updated', updatedItem);

          // Broadcast specific events for alerts
          if (oldStatus !== 'expired' && item.status === 'expired') {
            broadcast('inventory_expired', updatedItem);
          } else if (oldStatus !== 'out-of-stock' && item.status === 'out-of-stock') {
            broadcast('inventory_out_of_stock', updatedItem);
          } else if ((oldStatus === 'in-stock' || oldStatus === 'low-stock') && (item.status === 'critical-stock' || item.status === 'low-stock')) {
            broadcast('inventory_low_stock', updatedItem);
          }

          // Broadcast for newly added items (when status changes from undefined/null to something)
          if (!oldStatus && item.status) {
            broadcast('inventory_added', updatedItem);
          }

          console.log(`Updated item ${item.itemId}: status changed from ${oldStatus} to ${item.status}`);
        }
      }

      if (updatedCount > 0) {
        console.log(`Inventory monitor updated ${updatedCount} items`);
      } else {
        console.log('Inventory monitor: no updates needed');
      }

    } catch (error) {
      console.error('Error in inventory monitor check:', error);
    }
  }

  // Manual trigger for testing
  async triggerCheck() {
    console.log('Manual inventory check triggered');
    await this.checkInventory();
  }
}

module.exports = new InventoryMonitor();
