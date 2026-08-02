# Format d’import Atelier 2.0 V1.7

Les inventaires utilisent :

```json
{
  "format": "atelier-2.0",
  "version": "1.6",
  "type": "inventory",
  "inventory": {
    "items": [],
    "filaments": [],
    "tools": [],
    "machines": []
  }
}
```

Une machine peut contenir notamment : `code`, `name`, `category`, `brand`, `model`, `serial_number`, `location`, `status`, `purchase_date`, `purchase_price`, `warranty_until`, `power_w`, `kerf_mm`, `capacity_mm`, `last_maintenance`, `next_maintenance`, `maintenance_interval_days`, `manual_url`, `accessories`, `consumable_stock_ids`, `maintenance_history` et `notes`.

Les anciens inventaires V1.3 à V1.5 restent importables. Les champs absents sont simplement laissés vides.


Le champ facultatif `inventory.workshop_map` peut contenir le plan et ses repères.
