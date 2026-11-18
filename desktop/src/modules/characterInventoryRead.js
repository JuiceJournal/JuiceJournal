/**
 * An inventory read made from what GGG's API says a character carries, in the shape the inventory loot model takes
 * (inventoryLootModel.js). Path of Exile 1 only: the API gives no inventory for Path of Exile 2.
 *
 * Only stacks are read: currency, fragments, cards and the like, named by their base type, which is the name the
 * price list has them under. Gear, maps and unique items are left out. Their worth depends on what is on them, and
 * a wrong price would be a guess; the player adds those by hand.
 */

const MAIN_INVENTORY = 'MainInventory';

function isStack(item) {
  return Number.isInteger(item?.maxStackSize) && item.maxStackSize > 1;
}

// Null when the answer holds no inventory list: an inventory that was not sent is not an empty inventory.
function readCharacterInventory(character) {
  if (!Array.isArray(character?.inventory)) return null;

  const items = {};
  const cells = {};
  for (const item of character.inventory) {
    // An item that does not say it is in the main inventory, or how many it is, is left out: both would be a guess.
    if (item?.inventoryId !== MAIN_INVENTORY || !isStack(item)) continue;
    const name = String(item.baseType || item.typeLine || '').trim();
    const quantity = item.stackSize;
    if (!name || !Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(item.x) || !Number.isInteger(item.y)) continue;
    // The game's numbers are exact, so every stack counts as read with its digits.
    cells[`${item.y},${item.x}`] = { name, quantity, digits: true };
    items[name] = (items[name] || 0) + quantity;
  }
  return { open: true, items, cells };
}

module.exports = { readCharacterInventory };
