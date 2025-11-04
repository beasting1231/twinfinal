import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useBookingRequests } from "../hooks/useBookingRequests";
import { BookingRequestItem } from "./BookingRequestItem";
import { FormsContextMenu } from "./FormsContextMenu";
import type { BookingRequest } from "../types/index";

export function Forms() {
  const { bookingRequests, loading, updateBookingRequest, deleteBookingRequest } = useBookingRequests();
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    request: BookingRequest;
  } | null>(null);

  // Filter booking requests by status
  const pendingRequests = useMemo(() => {
    return bookingRequests.filter(req => req.status === "pending");
  }, [bookingRequests]);

  const waitlistRequests = useMemo(() => {
    return bookingRequests.filter(req => req.status === "waitlist");
  }, [bookingRequests]);

  const handleContextMenu = (request: BookingRequest, position: { x: number; y: number }) => {
    setContextMenu({
      isOpen: true,
      position,
      request,
    });
  };

  const handleAddToWaitlist = async () => {
    if (!contextMenu) return;
    await updateBookingRequest(contextMenu.request.id!, { status: "waitlist" });
    setContextMenu(null);
  };

  const handleRemoveFromWaitlist = async () => {
    if (!contextMenu) return;
    await updateBookingRequest(contextMenu.request.id!, { status: "pending" });
    setContextMenu(null);
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    await deleteBookingRequest(contextMenu.request.id!);
    setContextMenu(null);
  };

  const handleDateClick = (date: string) => {
    // This will be used to jump to a specific date in the daily plan
    console.log("Navigate to date:", date);
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 p-6 overflow-hidden">
      <h1 className="text-2xl font-bold text-white mb-6">Forms & Requests</h1>

      {/* Container card with tabs */}
      <div className="flex-1 bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden flex flex-col">
        <Tabs defaultValue="requests" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 bg-zinc-800 border-b border-zinc-700 rounded-none">
            <TabsTrigger value="requests" className="data-[state=active]:bg-zinc-900">
              Booking Requests ({pendingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="data-[state=active]:bg-zinc-900">
              Waiting List ({waitlistRequests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="flex-1 overflow-auto p-6 mt-0">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-8 h-8 border-4 border-zinc-700 border-t-white rounded-full animate-spin"></div>
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-zinc-500">No booking requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <BookingRequestItem
                    key={request.id}
                    request={request}
                    onContextMenu={handleContextMenu}
                    onDateClick={handleDateClick}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="waitlist" className="flex-1 overflow-auto p-6 mt-0">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-8 h-8 border-4 border-zinc-700 border-t-white rounded-full animate-spin"></div>
              </div>
            ) : waitlistRequests.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-zinc-500">No items in waiting list</p>
              </div>
            ) : (
              <div className="space-y-3">
                {waitlistRequests.map((request) => (
                  <BookingRequestItem
                    key={request.id}
                    request={request}
                    onContextMenu={handleContextMenu}
                    onDateClick={handleDateClick}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <FormsContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          onAddToWaitlist={contextMenu.request.status === "pending" ? handleAddToWaitlist : undefined}
          onRemoveFromWaitlist={contextMenu.request.status === "waitlist" ? handleRemoveFromWaitlist : undefined}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
