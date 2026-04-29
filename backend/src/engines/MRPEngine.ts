import { BOM, PRODUCT_TYPES } from '../models/BOM';
import { MRP_POLICIES, COSTS } from '../config/constants';
import { InventoryRecord, InventoryState } from '../models/Inventory';
import { PlannedOrder, OrderSet } from '../models/Order';
import { PRODUCTS } from '../models/Product';

export class MRPEngine {
  private initialInventory: InventoryState;
  private plannedOrders: OrderSet = {};
  private demandForecast: Record<string, number[]>;

  constructor(initialInventory: InventoryState, demandForecast: Record<string, number[]>) {
    this.initialInventory = initialInventory;
    this.demandForecast = demandForecast;
    this.initializePlannedOrders();
  }

  private initializePlannedOrders(): void {
    Object.keys(PRODUCTS).forEach(sku => {
      this.plannedOrders[sku] = [];
    });
  }

  simulate(weeks: number = 26): InventoryState {
    const inventoryState: InventoryState = {};

    // Copy initial inventory
    Object.keys(this.initialInventory).forEach(sku => {
      inventoryState[sku] = [...this.initialInventory[sku]];
    });

    // Run MRP logic for each week
    for (let week = 1; week <= weeks; week++) {
      this.processMRPWeek(week, inventoryState);
    }

    return inventoryState;
  }

  private processMRPWeek(week: number, inventory: InventoryState): void {
    // Process in order: PT -> SE -> MP (top-down explosion)
    this.processLevel('PT', week, inventory);
    this.processLevel('SE', week, inventory);
    this.processLevel('MP', week, inventory);
  }

  private processLevel(level: 'PT' | 'SE' | 'MP', week: number, inventory: InventoryState): void {
    const skus = PRODUCT_TYPES[level];

    skus.forEach(sku => {
      const product = PRODUCTS[sku];
      const policy = MRP_POLICIES[level];
      const currentInventory = inventory[sku][inventory[sku].length - 1];

      const weeksOfStock = currentInventory.closingBalance / (this.demandForecast[sku]?.[week] || 1);

      // Check if we need to reorder
      if (weeksOfStock < policy.minWeeks) {
        const quantityToOrder = (policy.maxWeeks * (this.demandForecast[sku]?.[week] || 0)) - currentInventory.closingBalance;

        if (quantityToOrder > 0) {
          this.plannedOrders[sku].push({
            sku,
            week,
            quantity: Math.round(quantityToOrder),
            orderType: level === 'MP' ? 'PURCHASE' : 'PRODUCTION',
            dueWeek: week + product.leadTime,
            status: 'PLANNED',
            reason: `Reorder point triggered (${weeksOfStock.toFixed(1)} weeks < ${policy.minWeeks} weeks minimum)`
          });

          // Generate dependent orders
          if (level !== 'MP') {
            this.generateDependentOrders(sku, Math.round(quantityToOrder), week);
          }
        }
      }

      // Update inventory with receipts from pending orders
      const receipts = this.plannedOrders[sku]
        .filter(o => o.dueWeek === week && o.status === 'PLANNED')
        .reduce((sum, o) => sum + o.quantity, 0);

      if (receipts > 0) {
        inventory[sku].push({
          sku,
          week,
          openingBalance: currentInventory.closingBalance,
          receipts,
          demand: this.demandForecast[sku]?.[week] || 0,
          closingBalance: currentInventory.closingBalance + receipts - (this.demandForecast[sku]?.[week] || 0),
          weeksOfStock: 0,
          plannedOrders: this.plannedOrders[sku].length
        });
      }
    });
  }

  private generateDependentOrders(parentSku: string, quantity: number, week: number): void {
    const bom = BOM[parentSku];
    if (!bom) return;

    bom.items.forEach(material => {
      const requiredQuantity = quantity * material.quantity;
      this.plannedOrders[material.sku].push({
        sku: material.sku,
        week,
        quantity: requiredQuantity,
        orderType: material.type === 'MP' ? 'PURCHASE' : 'PRODUCTION',
        dueWeek: week + PRODUCTS[material.sku].leadTime,
        status: 'PLANNED',
        reason: `Dependent order from ${parentSku} (${quantity} units × ${material.quantity})`
      });
    });
  }

  getPlannedOrders(): OrderSet {
    return this.plannedOrders;
  }
}