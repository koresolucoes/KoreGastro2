import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { triggerWebhook } from "../webhook-emitter.js";
import { withAuth, supabase } from "../utils/api-handler.js";

export default withAuth(async function handler(
  request: VercelRequest,
  response: VercelResponse,
  restaurantId: string,
) {
  switch (request.method) {
    case "GET":
      await handleGet(request, response, restaurantId);
      break;
    case "PATCH":
      await handlePatch(request, response, restaurantId);
      break;
    default:
      response.setHeader("Allow", ["GET", "PATCH"]);
      response
        .status(405)
        .json({ error: { message: `Method ${request.method} Not Allowed` } });
  }
});

async function handleGet(
  req: VercelRequest,
  res: VercelResponse,
  restaurantId: string,
) {
  const { resource } = req.query;

  if (resource === "drivers") {
    const { data, error } = await supabase
      .from("delivery_drivers")
      .select("id, name, phone, vehicle_type, is_active, employee_id")
      .eq("user_id", restaurantId)
      .eq("is_active", true);

    if (error) throw error;
    return res.status(200).json(data || []);
  }

  if (resource === "orders") {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*, order_items(*), customers(*)")
      .eq("user_id", restaurantId)
      .eq("order_type", "External-Delivery")
      .in("status", ["OPEN"]) // Only active orders
      .order("timestamp", { ascending: true });

    if (error) throw error;
    if (!orders) {
      return res.status(200).json([]);
    }

    const formattedOrders = orders.map((order) => {
      const customerData = Array.isArray(order.customers)
        ? order.customers[0]
        : order.customers;
      const items = (order.order_items as any[]) || [];
      const total_amount = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

      return {
        id: order.id,
        short_id: order.id.slice(0, 4),
        delivery_status: order.delivery_status,
        delivery_driver_id: order.delivery_driver_id,
        customer: {
          name: customerData?.name || "Não informado",
          phone: customerData?.phone || "Não informado",
          address: customerData?.address || "Não informado",
        },
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        delivery_address: {
          street: customerData?.address || "Endereço não informado",
          number: "",
          neighborhood: "",
          city: "",
          state: "",
          zip_code: "",
          latitude: customerData?.latitude,
          longitude: customerData?.longitude,
        },
        created_at: order.timestamp,
        total_amount: total_amount,
        delivery_fee: order.delivery_cost || 0,
        payment_method:
          order.notes?.replace("Pagamento: ", "") || "Não informado",
      };
    });

    return res.status(200).json(formattedOrders);
  }

  return res
    .status(400)
    .json({
      error: {
        message: "Invalid resource. Use ?resource=drivers or ?resource=orders",
      },
    });
}

const patchDeliverySchema = z.object({
  action: z.enum(["update_status", "assign_driver"]).optional(),
  orderId: z.string().uuid("orderId must be a valid UUID"),
  newStatus: z
    .enum(["OUT_FOR_DELIVERY", "ARRIVED_AT_DESTINATION", "DELIVERED"])
    .optional(),
  employeeId: z.string().uuid("employeeId must be a valid UUID").optional(),
});

async function handlePatch(
  req: VercelRequest,
  res: VercelResponse,
  restaurantId: string,
) {
  const parsed = patchDeliverySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        error: { message: "Invalid payload", details: parsed.error.issues },
      });
  }
  const { action, orderId, newStatus, employeeId } = parsed.data;

  // Default to 'update_status' if action is missing but newStatus is present (backward compatibility)
  const effectiveAction = action || (newStatus ? "update_status" : null);

  if (!effectiveAction) {
    return res
      .status(400)
      .json({
        error: {
          message:
            'An `action` (e.g., "update_status", "assign_driver") or `newStatus` is required.',
        },
      });
  }

  if (effectiveAction === "update_status") {
    if (!newStatus) {
      return res
        .status(400)
        .json({
          error: {
            message: "`newStatus` is required for action `update_status`.",
          },
        });
    }

    const updatePayload: {
      status?: string;
      delivery_status: string;
      completed_at?: string;
    } = {
      delivery_status: newStatus,
    };

    if (newStatus === "DELIVERED") {
      updatePayload.status = "COMPLETED";
      updatePayload.completed_at = new Date().toISOString();
    }

    const { data: updatedOrder, error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .eq("user_id", restaurantId)
      .eq("status", "OPEN")
      .select("*, customers(*), delivery_drivers(*)")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res
          .status(404)
          .json({
            error: {
              message: `Open delivery order with id "${orderId}" not found.`,
            },
          });
      }
      throw error;
    }

    try {
      await triggerWebhook(restaurantId, "delivery.status_updated", {
        orderId: updatedOrder.id,
        status: newStatus,
        driverId: updatedOrder.delivery_driver_id,
        timestamp: new Date().toISOString(),
        fullOrder: updatedOrder,
      });
    } catch (whError: any) {
      console.error(
        `[API /v2/deliveries] Webhook trigger failed for delivery status update on order ${updatedOrder.id}:`,
        whError.message,
      );
    }

    return res
      .status(200)
      .json({
        success: true,
        message: "Delivery status updated successfully.",
        order: updatedOrder,
      });
  } else if (effectiveAction === "assign_driver") {
    if (!employeeId) {
      return res
        .status(400)
        .json({
          error: {
            message: "`employeeId` is required for action `assign_driver`.",
          },
        });
    }

    const { data: driver, error: driverError } = await supabase
      .from("delivery_drivers")
      .select("id, base_rate, rate_per_km")
      .eq("employee_id", employeeId)
      .eq("user_id", restaurantId)
      .single();

    if (driverError || !driver) {
      return res
        .status(404)
        .json({
          error: {
            message: `Delivery driver associated with employee ID "${employeeId}" not found.`,
          },
        });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("delivery_distance_km")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res
        .status(404)
        .json({ error: { message: `Order with id "${orderId}" not found.` } });
    }

    const distance = order.delivery_distance_km ?? 0;
    const deliveryCost =
      (driver.base_rate ?? 0) + (driver.rate_per_km ?? 0) * distance;

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        delivery_driver_id: driver.id,
        delivery_status: "OUT_FOR_DELIVERY",
        delivery_cost: deliveryCost,
      })
      .eq("id", orderId)
      .eq("user_id", restaurantId)
      .select("*, customers(*), delivery_drivers(*)")
      .single();

    if (updateError) {
      if (updateError.code === "PGRST116") {
        return res
          .status(404)
          .json({
            error: {
              message: `Open delivery order with id "${orderId}" not found.`,
            },
          });
      }
      throw updateError;
    }

    try {
      await triggerWebhook(restaurantId, "delivery.status_updated", {
        orderId: updatedOrder.id,
        status: "OUT_FOR_DELIVERY",
        driverId: driver.id,
        timestamp: new Date().toISOString(),
        fullOrder: updatedOrder,
      });
    } catch (whError: any) {
      console.error(
        `[API /v2/deliveries] Webhook trigger failed for driver assignment on order ${updatedOrder.id}:`,
        whError.message,
      );
    }

    return res
      .status(200)
      .json({
        success: true,
        message: "Driver assigned successfully.",
        order: updatedOrder,
      });
  }
}
