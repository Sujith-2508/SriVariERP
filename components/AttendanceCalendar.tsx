'use client';

import React, { useState, useEffect } from 'react';
import { Agent } from '@/types';
import { getAttendance } from '@/lib/agentTrackingService';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';

interface AttendanceCalendarProps {
    agent: Agent;
}

export function AttendanceCalendar({ agent }: AttendanceCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [attendanceData, setAttendanceData] = useState<Map<string, any>>(new Map());
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [loading, setLoading] = useState(false);

    // Load attendance data for current month
    useEffect(() => {
        loadAttendance();
    }, [agent.id, currentDate]);

    const loadAttendance = async () => {
        setLoading(true);
        const month = currentDate.getMonth() + 1;
        const year = currentDate.getFullYear();

        const records = await getAttendance(agent.id, month, year);

        const dataMap = new Map();
        records.forEach(record => {
            const dateKey = format(record.date, 'yyyy-MM-dd');
            dataMap.set(dateKey, record);
        });

        setAttendanceData(dataMap);
        setLoading(false);
    };

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Get day of week for first day (0 = Sunday)
    const firstDayOfWeek = monthStart.getDay();

    // Previous/Next month
    const previousMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    };

    // Get attendance status for a day
    const getAttendanceStatus = (day: Date) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        return attendanceData.get(dateKey);
    };

    // Get color for day based on status
    const getDayColor = (day: Date) => {
        const attendance = getAttendanceStatus(day);
        if (!attendance) return 'bg-white hover:bg-slate-50';

        switch (attendance.status) {
            case 'PRESENT':
                return 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800';
            case 'HALF_DAY':
                return 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800';
            case 'ABSENT':
                return 'bg-red-100 hover:bg-red-200 text-red-800';
            case 'LEAVE':
                return 'bg-blue-100 hover:bg-blue-200 text-blue-800';
            default:
                return 'bg-white hover:bg-slate-50';
        }
    };

    // Calculate summary stats
    const presentDays = Array.from(attendanceData.values()).filter(a => a.status === 'PRESENT').length;
    const absentDays = Array.from(attendanceData.values()).filter(a => a.status === 'ABSENT').length;
    const halfDays = Array.from(attendanceData.values()).filter(a => a.status === 'HALF_DAY').length;
    const totalHours = Array.from(attendanceData.values()).reduce((sum, a) => sum + (a.totalHours || 0), 0);

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="border-b border-slate-200 p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Attendance Calendar</h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={previousMonth}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className="px-4 py-2 bg-slate-100 rounded-lg font-semibold text-slate-800 min-w-[150px] text-center">
                            {format(currentDate, 'MMMM yyyy')}
                        </div>
                        <button
                            onClick={nextMonth}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-4 gap-3">
                    <div className="bg-emerald-50 p-3 rounded-lg">
                        <div className="text-xs text-emerald-600 font-medium mb-1">Present</div>
                        <div className="text-2xl font-bold text-emerald-700">{presentDays}</div>
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg">
                        <div className="text-xs text-red-600 font-medium mb-1">Absent</div>
                        <div className="text-2xl font-bold text-red-700">{absentDays}</div>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded-lg">
                        <div className="text-xs text-yellow-600 font-medium mb-1">Half Day</div>
                        <div className="text-2xl font-bold text-yellow-700">{halfDays}</div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="text-xs text-blue-600 font-medium mb-1">Total Hours</div>
                        <div className="text-2xl font-bold text-blue-700">{totalHours.toFixed(1)}</div>
                    </div>
                </div>
            </div>

            {/* Calendar */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-slate-500">Loading attendance...</p>
                        </div>
                    </div>
                ) : (
                    <div>
                        {/* Day headers */}
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className="text-center text-xs font-semibold text-slate-600 py-2">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 gap-2">
                            {/* Empty cells for days before month starts */}
                            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square" />
                            ))}

                            {/* Days of month */}
                            {daysInMonth.map(day => {
                                const attendance = getAttendanceStatus(day);
                                const isSelected = selectedDay && isSameDay(day, selectedDay);
                                const isToday = isSameDay(day, new Date());

                                return (
                                    <button
                                        key={day.toISOString()}
                                        onClick={() => setSelectedDay(day)}
                                        className={`aspect-square rounded-lg border-2 transition-all ${isSelected
                                                ? 'border-emerald-600 shadow-lg'
                                                : 'border-transparent'
                                            } ${isToday
                                                ? 'ring-2 ring-blue-500'
                                                : ''
                                            } ${getDayColor(day)}`}
                                    >
                                        <div className="flex flex-col items-center justify-center h-full">
                                            <div className="text-sm font-semibold">{format(day, 'd')}</div>
                                            {attendance && (
                                                <div className="text-xs mt-1">
                                                    {attendance.totalHours ? `${attendance.totalHours.toFixed(1)}h` : ''}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Selected day details */}
            {selectedDay && (
                <div className="border-t border-slate-200 p-4 bg-slate-50">
                    <h4 className="font-semibold text-slate-800 mb-3">
                        {format(selectedDay, 'EEEE, MMMM d, yyyy')}
                    </h4>

                    {(() => {
                        const attendance = getAttendanceStatus(selectedDay);
                        if (!attendance) {
                            return (
                                <div className="text-sm text-slate-500">No attendance record for this day</div>
                            );
                        }

                        return (
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Status:</span>
                                    <span className={`font-semibold ${attendance.status === 'PRESENT' ? 'text-emerald-700' :
                                            attendance.status === 'HALF_DAY' ? 'text-yellow-700' :
                                                attendance.status === 'ABSENT' ? 'text-red-700' :
                                                    'text-blue-700'
                                        }`}>
                                        {attendance.status?.replace('_', ' ')}
                                    </span>
                                </div>

                                {attendance.checkInTime && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Check In:</span>
                                        <span className="font-semibold text-slate-800">
                                            {format(new Date(attendance.checkInTime), 'h:mm a')}
                                        </span>
                                    </div>
                                )}

                                {attendance.checkOutTime && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Check Out:</span>
                                        <span className="font-semibold text-slate-800">
                                            {format(new Date(attendance.checkOutTime), 'h:mm a')}
                                        </span>
                                    </div>
                                )}

                                {attendance.totalHours && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Total Hours:</span>
                                        <span className="font-semibold text-slate-800">
                                            {attendance.totalHours.toFixed(2)} hours
                                        </span>
                                    </div>
                                )}

                                {attendance.notes && (
                                    <div className="mt-3 p-2 bg-white rounded border border-slate-200">
                                        <div className="text-xs text-slate-500 mb-1">Notes:</div>
                                        <div className="text-slate-700">{attendance.notes}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Legend */}
            <div className="border-t border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-600 mb-2">Legend</div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-emerald-100 rounded border border-emerald-200" />
                        <span className="text-slate-600">Present</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-yellow-100 rounded border border-yellow-200" />
                        <span className="text-slate-600">Half Day</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-red-100 rounded border border-red-200" />
                        <span className="text-slate-600">Absent</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-blue-100 rounded border border-blue-200" />
                        <span className="text-slate-600">Leave</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
