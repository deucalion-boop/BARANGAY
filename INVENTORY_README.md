# Inventory Management System

## Overview
The inventory management system has been successfully integrated with MongoDB and provides real-time updates for the barangay community portal. The system allows administrators to manage medical supplies, medications, and equipment with automatic stock level monitoring and expiration tracking.

## Features

### ✅ Completed Features
- **MongoDB Integration**: Full CRUD operations with MongoDB
- **Real-time Updates**: Server-Sent Events (SSE) for live updates
- **Stock Management**: Automatic status calculation (in-stock, low-stock, critical, out-of-stock)
- **Expiration Tracking**: Monitor items expiring within 30 days
- **Filtering & Search**: Search by name, ID, category, location, status
- **Statistics Dashboard**: Real-time metrics and alerts
- **Responsive Design**: Mobile-friendly interface

### 🔧 Core Functionality
1. **Add Items**: Create new inventory items with all details
2. **Edit Items**: Update item information
3. **Stock Adjustments**: Add, subtract, or set stock levels
4. **Delete Items**: Soft delete (mark as inactive)
5. **Filter & Search**: Find items quickly
6. **Real-time Updates**: All changes broadcast to connected clients

## Database Schema

### Inventory Model (`models/inventory.js`)
```javascript
{
  itemId: String (unique, required),
  itemName: String (required),
  category: String (enum: medication, medical-supplies, fluids, equipment, other),
  location: String (enum: pharmacy, pediatrics, surgery, emergency, storage),
  currentStock: Number (required, min: 0),
  reorderPoint: Number (required, min: 0),
  expirationDate: Date (optional),
  supplier: String (optional),
  unitPrice: Number (min: 0),
  description: String (optional),
  status: String (auto-calculated),
  createdBy: ObjectId (ref: User),
  isActive: Boolean (default: true),
  timestamps: true
}
```

## API Endpoints

### Inventory Management
- `GET /admin/api/inventory` - Get all items (with filtering)
- `GET /admin/api/inventory/:id` - Get single item
- `POST /admin/api/inventory` - Create new item
- `PUT /admin/api/inventory/:id` - Update item
- `DELETE /admin/api/inventory/:id` - Delete item (soft delete)
- `PATCH /admin/api/inventory/:id/stock` - Update stock levels
- `GET /admin/api/inventory/statistics` - Get inventory statistics

### Real-time Updates
- `GET /admin/events` - Server-Sent Events stream

## Usage

### Adding Items
1. Click "Add New Item" button
2. Fill in required fields (Item ID, Name, Category, Location, Stock, Reorder Point)
3. Optionally add expiration date, supplier, price, description
4. Submit form

### Managing Stock
1. Click the adjust stock button (sliders icon) on any item
2. Use format: `+10` (add), `-5` (subtract), `=20` (set)
3. Stock status updates automatically

### Filtering Items
1. Use the filter section at the top
2. Search by name/ID
3. Filter by category, location, status, expiration
4. Click "Apply Filters" or "Clear Filters"

### Real-time Updates
- All changes are automatically broadcast to connected clients
- Statistics update in real-time
- No page refresh needed

## Status Calculations

### Stock Status
- **Out of Stock**: currentStock = 0
- **Critical Stock**: currentStock ≤ reorderPoint * 0.5
- **Low Stock**: currentStock ≤ reorderPoint
- **In Stock**: currentStock > reorderPoint

### Expiration Status
- **Expired**: expirationDate < now
- **Expiring Soon**: expirationDate within 30 days
- **Valid**: expirationDate > 30 days from now

## Testing

Run the test script to verify functionality:
```bash
node test-inventory.js
```

## Security
- All routes require admin authentication
- Input validation on all fields
- SQL injection protection via Mongoose
- XSS protection in templates

## Performance
- Indexed database queries for fast searches
- Pagination support for large datasets
- Efficient real-time updates via SSE
- Responsive design for mobile devices

## Future Enhancements
- Barcode scanning support
- Purchase order generation
- Automated reorder alerts
- Inventory reports and analytics
- Multi-location support
- Batch operations
