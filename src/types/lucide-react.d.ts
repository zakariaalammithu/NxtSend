import * as React from 'react';

declare module 'lucide-react' {
  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
    className?: string;
  }

  export type LucideIcon = React.ForwardRefExoticComponent<
    React.PropsWithoutRef<LucideProps> & React.RefAttributes<SVGSVGElement>
  >;

  // Base & Common
  export const Loader2: LucideIcon;
  export const X: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Zap: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const Info: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const MoreHorizontal: LucideIcon;
  export const MoreVertical: LucideIcon;
  export const Search: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowUp: LucideIcon;
  export const ArrowDown: LucideIcon;
  export const ArrowUpDown: LucideIcon;
  export const HelpCircle: LucideIcon;

  // Navigation & Sections
  export const LayoutDashboard: LucideIcon;
  export const Target: LucideIcon;
  export const Linkedin: LucideIcon;
  export const Mail: LucideIcon;
  export const MessageSquare: LucideIcon;
  export const Users: LucideIcon;
  export const User: LucideIcon;
  export const UserCheck: LucideIcon;
  export const UserPlus: LucideIcon;
  export const UserX: LucideIcon;
  export const BarChart: LucideIcon;
  export const BarChart2: LucideIcon;
  export const BarChart3: LucideIcon;
  export const Puzzle: LucideIcon;
  export const CreditCard: LucideIcon;
  export const Settings: LucideIcon;
  export const Bell: LucideIcon;
  export const Shield: LucideIcon;
  export const LogOut: LucideIcon;

  // Actions & Controls
  export const Plus: LucideIcon;
  export const Filter: LucideIcon;
  export const Download: LucideIcon;
  export const Upload: LucideIcon;
  export const Trash2: LucideIcon;
  export const Edit: LucideIcon;
  export const Edit2: LucideIcon;
  export const Edit3: LucideIcon;
  export const Copy: LucideIcon;
  export const Archive: LucideIcon;
  export const Pause: LucideIcon;
  export const Play: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Lock: LucideIcon;
  export const Send: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Clock: LucideIcon;
  export const Building2: LucideIcon;
  export const PieChart: LucideIcon;
  export const Activity: LucideIcon;
  export const Globe: LucideIcon;
  export const Sliders: LucideIcon;
  export const Database: LucideIcon;
  export const Key: LucideIcon;
  export const TrendingUp: LucideIcon;
  export const TrendingDown: LucideIcon;
  export const FileText: LucideIcon;
  export const Inbox: LucideIcon;
  export const CornerUpLeft: LucideIcon;
  export const CheckCheck: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const ShieldAlert: LucideIcon;
  export const Phone: LucideIcon;
  export const Calendar: LucideIcon;
  export const DollarSign: LucideIcon;
  export const Layers: LucideIcon;

  // Catch-all
  const defaultIcon: LucideIcon;
  export default defaultIcon;
}
