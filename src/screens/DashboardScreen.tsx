'use client';
import React from 'react';
import { SkeletonDashboard } from '@/components/ui/SkeletonLoaders';
import { fmtDate } from '@/lib/helpers';
import { useDashboardData } from '@/components/dashboard/useDashboardData';
import DashboardDateRange from '@/components/dashboard/DashboardDateRange';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DashboardKPIs from '@/components/dashboard/DashboardKPIs';
import DashboardQuickActions from '@/components/dashboard/DashboardQuickActions';
import DashboardAgendaToday from '@/components/dashboard/DashboardAgendaToday';
import DashboardProjectsList from '@/components/dashboard/DashboardProjectsList';
import DashboardSprintProgress from '@/components/dashboard/DashboardSprintProgress';
import DashboardFinancialSummary from '@/components/dashboard/DashboardFinancialSummary';
import DashboardTeamQuickView from '@/components/dashboard/DashboardTeamQuickView';
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import DashboardActivity from '@/components/dashboard/DashboardActivity';
import DashboardWeeklyAgenda from '@/components/dashboard/DashboardWeeklyAgenda';

export default function DashboardScreen() {
  const data = useDashboardData();

  return (
    <div className="animate-fadeIn space-y-4">
      {data.loading && <SkeletonDashboard />}
      {!data.loading && (<>

      {/* ════════════ Date Range Selector ════════════ */}
      <DashboardDateRange
        dateRange={data.dateRange}
        setDateRange={data.setDateRange}
        customStart={data.customStart}
        setCustomStart={data.setCustomStart}
        customEnd={data.customEnd}
        setCustomEnd={data.setCustomEnd}
        startDate={data.startDate}
        endDate={data.endDate}
      />

      {/* ════════════ ROW 0: Personalized Header ════════════ */}
      <DashboardHeader
        greeting={data.greeting}
        userName={data.userName}
        dateFormatted={data.dateFormatted}
        unreadCount={data.unreadCount}
        overdueCount={data.overdueCount}
        todayMeetings={data.todayMeetings}
        todayDueTasks={data.todayDueTasks}
        overdueRFIs={data.overdueRFIs}
        overdueInvoices={data.overdueInvoices}
        navigateTo={data.navigateTo}
        showToast={data.showToast}
        projects={data.projects}
        tasks={data.tasks}
        expenses={data.expenses}
        invoices={data.invoices}
        teamUsers={data.teamUsers}
        timeEntries={data.timeEntries}
      />

      {/* ════════════ ROW 1: KPI Cards (8) ════════════ */}
      <DashboardKPIs
        projectsLength={data.projects.length}
        execProjects={data.execProjects}
        rangeTasks={data.rangeTasks}
        rangeActiveTasks={data.rangeActiveTasks}
        overdueCount={data.overdueCount}
        todayMeetingsLength={data.todayMeetings.length}
        weekTasksLength={data.weekTasks.length}
        openRFIs={data.openRFIs}
        pendingSubmittals={data.pendingSubmittals}
        overdueRFIs={data.overdueRFIs}
        openPunchItems={data.openPunchItems}
        punchItemsLength={data.punchItems.length}
        totalExpenses={data.totalExpenses}
        totalBudget={data.totalBudget}
        rangeTotalTime={data.rangeTotalTime}
        rangeTimeEntriesLength={data.rangeTimeEntries.length}
        fmtHours={data.fmtHours}
        navigateTo={data.navigateTo}
      />

      {/* ════════════ Quick Actions ════════════ */}
      <DashboardQuickActions
        navigateTo={data.navigateTo}
        openModal={data.openModal}
        setForms={data.setForms}
        pendingApprovals={data.pendingApprovals}
        invLowStock={data.invLowStock}
      />

      {/* ════════════ ROW 2: Today's Agenda + Projects ════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <DashboardAgendaToday
          overdueTasks={data.overdueTasks}
          overdueCount={data.overdueCount}
          todayMeetings={data.todayMeetings}
          todayDueTasks={data.todayDueTasks}
          todayOnly={data.todayOnly}
          projects={data.projects}
          navigateTo={data.navigateTo}
        />
        <DashboardProjectsList
          visibleProjects={data.visibleProjects}
          companies={data.companies}
          navigateTo={data.navigateTo}
          openProject={data.openProject}
        />
      </div>

      {/* ════════════ ROW 3: Sprint Progress + Financial Summary ════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardSprintProgress
          rangeCompletedTasks={data.rangeCompletedTasks}
          rangeTasksLength={data.rangeTasks.length}
          rangeActiveTasks={data.rangeActiveTasks}
          rangeTotalTime={data.rangeTotalTime}
          rangeTimeEntriesLength={data.rangeTimeEntries.length}
          taskStatusData={data.taskStatusData}
          fmtHours={data.fmtHours}
        />
        <DashboardFinancialSummary
          totalInvoiced={data.totalInvoiced}
          totalPaid={data.totalPaid}
          totalExpenses={data.totalExpenses}
          totalBudget={data.totalBudget}
          overdueInvoices={data.overdueInvoices}
          navigateTo={data.navigateTo}
        />
        <DashboardTeamQuickView
          teamWorkload={data.teamWorkload}
          navigateTo={data.navigateTo}
        />
      </div>

      {/* ════════════ ROW 4: Charts ════════════ */}
      <DashboardCharts
        revenueTrend={data.revenueTrend}
        teamWorkload={data.teamWorkload}
        navigateTo={data.navigateTo}
      />

      {/* ════════════ ROW 5: Activity + Notifications ════════════ */}
      <DashboardActivity
        recentActivity={data.recentActivity}
        unreadNotifs={data.unreadNotifs}
        readNotifs={data.readNotifs}
        unreadCount={data.unreadCount}
        navigateTo={data.navigateTo}
        fmtDate={fmtDate}
      />

      {/* ════════════ ROW 6: Weekly Agenda ════════════ */}
      <DashboardWeeklyAgenda
        agendaTasks={data.agendaTasks}
        agendaWeekDates={data.agendaWeekDates}
        agendaWeekLabel={data.agendaWeekLabel}
        agendaTodayKey={data.agendaTodayKey}
        agendaProjectMap={data.agendaProjectMap}
        agendaOccupiedSlots={data.agendaOccupiedSlots}
        agendaTasksByDayAndStartHour={data.agendaTasksByDayAndStartHour}
        agendaTaskStartHoursByDay={data.agendaTaskStartHoursByDay}
        navigateTo={data.navigateTo}
      />

      </>)}
    </div>
  );
}
