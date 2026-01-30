import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";

export default function Finance() {
  // Mock data for MVP
  const transactions = [
    { id: 1, campaign: "Summer Launch", influencer: "Jane Doe", amount: 500, date: "2024-05-15", status: "Paid" },
    { id: 2, campaign: "Summer Launch", influencer: "John Smith", amount: 750, date: "2024-05-18", status: "Pending" },
    { id: 3, campaign: "Winter Promo", influencer: "Alice Wonder", amount: 1200, date: "2024-02-10", status: "Paid" },
    { id: 4, campaign: "Winter Promo", influencer: "Bob Builder", amount: 300, date: "2024-02-12", status: "Paid" },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
          <p className="text-muted-foreground mt-1">Track payments and budget utilization.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend (YTD)</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">$24,500</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                <TrendingUp className="w-3 h-3 text-green-500 mr-1" />
                +12% from last month
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payments</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">$3,250</div>
              <p className="text-xs text-muted-foreground mt-1">5 invoices pending</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Cost / Influencer</CardTitle>
              <TrendingDown className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">$685</div>
              <p className="text-xs text-muted-foreground mt-1">Based on last 30 campaigns</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Influencer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{tx.date}</TableCell>
                    <TableCell className="font-medium">{tx.campaign}</TableCell>
                    <TableCell>{tx.influencer}</TableCell>
                    <TableCell>
                      <Badge variant={tx.status === 'Paid' ? 'default' : 'outline'} className={tx.status === 'Paid' ? 'bg-green-100 text-green-700 hover:bg-green-200 border-0' : ''}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">${tx.amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
