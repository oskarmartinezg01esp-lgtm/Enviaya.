import { Home, MessageCircle, LayoutGrid, ShoppingCart, Package, MapPin, CreditCard, User } from "lucide-react";

export const SIDEBAR_NAV = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/conversacion", label: "Conversación", icon: MessageCircle },
  { href: "/catalogo", label: "Catálogo", icon: LayoutGrid },
  { href: "/carrito", label: "Carrito", icon: ShoppingCart },
  { href: "/pedidos", label: "Pedidos", icon: Package },
  { href: "/direcciones", label: "Direcciones", icon: MapPin },
  { href: "/pagos", label: "Pagos", icon: CreditCard },
  { href: "/perfil", label: "Perfil", icon: User },
] as const;

export const BOTTOM_NAV = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/conversacion", label: "Conversación", icon: MessageCircle },
  { href: "/carrito", label: "Carrito", icon: ShoppingCart },
  { href: "/pedidos", label: "Pedidos", icon: Package },
  { href: "/perfil", label: "Perfil", icon: User },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
