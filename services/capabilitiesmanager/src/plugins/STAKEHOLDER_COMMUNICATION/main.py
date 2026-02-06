#!/usr/bin/env python3
"""
Stakeholder Communication Plugin - Stakeholder updates and engagement
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class StakeholderUpdate:
    """Stakeholder update model"""
    update_id: str
    title: str
    content: str
    stakeholder_groups: List[str]
    priority: str
    created_by: str
    created_at: str
    scheduled_send: str
    status: str
    read_count: int = 0


@dataclass
class Notification:
    """Notification model"""
    notification_id: str
    update_id: str
    recipient_id: str
    notification_type: str
    sent_date: str
    read_date: Optional[str]
    delivery_status: str


@dataclass
class MeetingSchedule:
    """Meeting schedule model"""
    meeting_id: str
    title: str
    date_time: str
    duration_minutes: int
    attendees: List[str]
    agenda: str
    location: str
    created_at: str


class StakeholderCommunicationPlugin:
    """Stakeholder Communication Plugin - Manages stakeholder communications"""

    def __init__(self):
        """Initialize the Stakeholder Communication Plugin"""
        self.updates: Dict[str, StakeholderUpdate] = {}
        self.notifications: Dict[str, Notification] = {}
        self.responses: Dict[str, Dict] = {}
        self.meetings: Dict[str, MeetingSchedule] = {}
        self.reports: Dict[str, Dict] = {}
        self.archive: Dict[str, Dict] = {}
        self.logger = logging.getLogger(__name__)
        self.logger.info("Stakeholder Communication Plugin initialized")

    def create_update(self, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a stakeholder communication update

        Args:
            update_data: Update content and distribution details

        Returns:
            Dictionary with created update
        """
        try:
            self.logger.info(f"Creating stakeholder update: {update_data.get('title', 'Unknown')}")

            update_id = f"upd_{datetime.now().timestamp()}"

            update = StakeholderUpdate(
                update_id=update_id,
                title=update_data.get("title", ""),
                content=update_data.get("content", ""),
                stakeholder_groups=update_data.get("stakeholder_groups", []),
                priority=update_data.get("priority", "MEDIUM"),
                created_by=update_data.get("created_by", "System"),
                created_at=datetime.now().isoformat(),
                scheduled_send=update_data.get("scheduled_send", datetime.now().isoformat()),
                status="draft"
            )

            self.updates[update_id] = update
            self.logger.info(f"Update created: {update_id}")
            return asdict(update)

        except Exception as e:
            self.logger.error(f"Error in create_update: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def send_notification(self, update_id: str, notification_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send notifications to stakeholders

        Args:
            update_id: The update ID to send
            notification_data: Notification distribution details

        Returns:
            Dictionary with notification results
        """
        try:
            self.logger.info(f"Sending notifications for update {update_id}")

            if update_id not in self.updates:
                return {"error": f"Update {update_id} not found", "status": "failed"}

            update = self.updates[update_id]
            recipients = notification_data.get("recipients", [])
            notification_type = notification_data.get("notification_type", "email")

            results = {
                "update_id": update_id,
                "sent_count": 0,
                "failed_count": 0,
                "notifications": [],
                "send_time": datetime.now().isoformat()
            }

            for recipient_id in recipients:
                notification_id = f"notif_{update_id}_{recipient_id}_{datetime.now().timestamp()}"

                notification = Notification(
                    notification_id=notification_id,
                    update_id=update_id,
                    recipient_id=recipient_id,
                    notification_type=notification_type,
                    sent_date=datetime.now().isoformat(),
                    read_date=None,
                    delivery_status="sent"
                )

                self.notifications[notification_id] = notification
                results["notifications"].append(asdict(notification))
                results["sent_count"] += 1

            update.status = "sent"
            update.read_count = 0

            self.logger.info(f"Notifications sent: {results['sent_count']} recipients")
            return results

        except Exception as e:
            self.logger.error(f"Error in send_notification: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def track_response(self, update_id: str, response_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Track stakeholder responses and engagement

        Args:
            update_id: The update ID to track responses for
            response_data: Response information

        Returns:
            Dictionary with response tracking
        """
        try:
            self.logger.info(f"Tracking response for update {update_id}")

            if update_id not in self.updates:
                return {"error": f"Update {update_id} not found", "status": "failed"}

            response_id = f"resp_{update_id}_{datetime.now().timestamp()}"

            response = {
                "response_id": response_id,
                "update_id": update_id,
                "responder_id": response_data.get("responder_id", ""),
                "response_type": response_data.get("response_type", "feedback"),
                "content": response_data.get("content", ""),
                "sentiment": response_data.get("sentiment", "neutral"),
                "response_date": datetime.now().isoformat(),
                "action_required": response_data.get("action_required", False)
            }

            self.responses[response_id] = response
            update = self.updates[update_id]
            update.read_count += 1

            result = {
                "response_id": response_id,
                "update_id": update_id,
                "total_responses": len([r for r in self.responses.values() if r["update_id"] == update_id]),
                "engagement_rate": self._calculate_engagement_rate(update_id)
            }

            self.logger.info(f"Response tracked: {response_id}")
            return result

        except Exception as e:
            self.logger.error(f"Error in track_response: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def create_report(self, update_id: str, report_params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create engagement and impact report

        Args:
            update_id: The update ID to report on
            report_params: Report parameters

        Returns:
            Dictionary with report data
        """
        try:
            self.logger.info(f"Creating report for update {update_id}")

            if update_id not in self.updates:
                return {"error": f"Update {update_id} not found", "status": "failed"}

            update = self.updates[update_id]
            report_id = f"rep_{update_id}_{datetime.now().timestamp()}"

            # Calculate metrics
            update_responses = [r for r in self.responses.values() if r["update_id"] == update_id]
            positive_responses = len([r for r in update_responses if r["sentiment"] == "positive"])
            negative_responses = len([r for r in update_responses if r["sentiment"] == "negative"])

            report = {
                "report_id": report_id,
                "update_id": update_id,
                "generated_at": datetime.now().isoformat(),
                "title": update.title,
                "total_recipients": len(update.stakeholder_groups),
                "engagement_metrics": {
                    "read_count": update.read_count,
                    "response_count": len(update_responses),
                    "engagement_rate": self._calculate_engagement_rate(update_id),
                    "positive_responses": positive_responses,
                    "negative_responses": negative_responses,
                    "sentiment_score": self._calculate_sentiment_score(update_responses)
                },
                "stakeholder_groups": update.stakeholder_groups,
                "key_feedback": [r["content"] for r in update_responses if r.get("content")],
                "action_items": [r["content"] for r in update_responses if r.get("action_required")]
            }

            self.reports[report_id] = report
            self.logger.info(f"Report created: {report_id}")
            return report

        except Exception as e:
            self.logger.error(f"Error in create_report: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def schedule_meeting(self, meeting_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Schedule stakeholder meetings

        Args:
            meeting_data: Meeting details and attendees

        Returns:
            Dictionary with scheduled meeting
        """
        try:
            self.logger.info(f"Scheduling meeting: {meeting_data.get('title', 'Unknown')}")

            meeting_id = f"mtg_{datetime.now().timestamp()}"

            meeting = MeetingSchedule(
                meeting_id=meeting_id,
                title=meeting_data.get("title", ""),
                date_time=meeting_data.get("date_time", ""),
                duration_minutes=int(meeting_data.get("duration_minutes", 60)),
                attendees=meeting_data.get("attendees", []),
                agenda=meeting_data.get("agenda", ""),
                location=meeting_data.get("location", "Virtual"),
                created_at=datetime.now().isoformat()
            )

            self.meetings[meeting_id] = meeting
            self.logger.info(f"Meeting scheduled: {meeting_id}")
            return asdict(meeting)

        except Exception as e:
            self.logger.error(f"Error in schedule_meeting: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def archive_update(self, update_id: str, archive_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Archive a stakeholder update

        Args:
            update_id: The update ID to archive
            archive_data: Archive information

        Returns:
            Dictionary with archive confirmation
        """
        try:
            self.logger.info(f"Archiving update {update_id}")

            if update_id not in self.updates:
                return {"error": f"Update {update_id} not found", "status": "failed"}

            update = self.updates[update_id]

            archive_entry = {
                "archive_id": f"arch_{update_id}_{datetime.now().timestamp()}",
                "update_id": update_id,
                "title": update.title,
                "archived_at": datetime.now().isoformat(),
                "reason": archive_data.get("reason", ""),
                "final_metrics": {
                    "read_count": update.read_count,
                    "response_count": len([r for r in self.responses.values() if r["update_id"] == update_id])
                }
            }

            self.archive[archive_entry["archive_id"]] = archive_entry
            update.status = "archived"

            self.logger.info(f"Update archived: {archive_entry['archive_id']}")
            return archive_entry

        except Exception as e:
            self.logger.error(f"Error in archive_update: {str(e)}")
            return {"error": str(e), "status": "failed"}

    # Helper methods
    def _calculate_engagement_rate(self, update_id: str) -> float:
        """Calculate engagement rate for an update"""
        if update_id not in self.updates:
            return 0.0

        update = self.updates[update_id]
        total_recipients = len(update.stakeholder_groups) if update.stakeholder_groups else 1
        engagement_rate = (update.read_count / total_recipients) * 100 if total_recipients > 0 else 0
        return min(engagement_rate, 100)

    def _calculate_sentiment_score(self, responses: List[Dict]) -> float:
        """Calculate overall sentiment score"""
        if not responses:
            return 0.5

        sentiment_scores = {
            "positive": 1.0,
            "neutral": 0.5,
            "negative": 0.0
        }

        total_score = sum(
            sentiment_scores.get(r.get("sentiment", "neutral"), 0.5)
            for r in responses
        )

        return total_score / len(responses) if responses else 0.5


    def generate_engagement_analytics(self, date_range: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Generate comprehensive engagement analytics

        Args:
            date_range: Optional date range filter

        Returns:
            Dictionary with engagement analytics
        """
        try:
            self.logger.info("Generating engagement analytics")

            analytics = {
                "timestamp": datetime.now().isoformat(),
                "total_updates": len(self.updates),
                "total_notifications": len(self.notifications),
                "total_responses": len(self.responses),
                "engagement_metrics": {
                    "average_read_rate": 0.0,
                    "average_response_rate": 0.0,
                    "average_engagement_score": 0.0
                },
                "top_performing_updates": [],
                "low_performing_updates": [],
                "sentiment_distribution": {}
            }

            if self.updates:
                total_read_rate = sum(
                    self._calculate_engagement_rate(u_id) for u_id in self.updates.keys()
                )
                analytics["engagement_metrics"]["average_read_rate"] = total_read_rate / len(self.updates)

            if self.responses:
                sentiment_counts = {}
                for response in self.responses.values():
                    sentiment = response.get("sentiment", "neutral")
                    sentiment_counts[sentiment] = sentiment_counts.get(sentiment, 0) + 1
                analytics["sentiment_distribution"] = sentiment_counts

            # Find top and low performers
            sorted_updates = sorted(
                [(u_id, self._calculate_engagement_rate(u_id)) for u_id in self.updates.keys()],
                key=lambda x: x[1],
                reverse=True
            )
            analytics["top_performing_updates"] = [u[0] for u in sorted_updates[:3]]
            analytics["low_performing_updates"] = [u[0] for u in sorted_updates[-3:]]

            self.logger.info("Engagement analytics generated")
            return analytics

        except Exception as e:
            self.logger.error(f"Error in generate_engagement_analytics: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def get_stakeholder_feedback(self, update_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Collect and summarize stakeholder feedback

        Args:
            update_id: Optional filter by specific update

        Returns:
            Dictionary with feedback summary
        """
        try:
            self.logger.info("Collecting stakeholder feedback")

            feedback_summary = {
                "timestamp": datetime.now().isoformat(),
                "total_feedback_items": 0,
                "feedback_by_type": {},
                "action_items": [],
                "sentiment_summary": "",
                "key_themes": []
            }

            filtered_responses = self.responses.values()
            if update_id:
                filtered_responses = [r for r in self.responses.values() if r["update_id"] == update_id]

            feedback_summary["total_feedback_items"] = len(filtered_responses)

            # Categorize feedback
            for response in filtered_responses:
                resp_type = response.get("response_type", "feedback")
                if resp_type not in feedback_summary["feedback_by_type"]:
                    feedback_summary["feedback_by_type"][resp_type] = []
                feedback_summary["feedback_by_type"][resp_type].append(response.get("content", ""))

                if response.get("action_required"):
                    feedback_summary["action_items"].append(response.get("content", ""))

            # Calculate sentiment summary
            positive_count = len([r for r in filtered_responses if r.get("sentiment") == "positive"])
            negative_count = len([r for r in filtered_responses if r.get("sentiment") == "negative"])

            if positive_count > negative_count:
                feedback_summary["sentiment_summary"] = "Predominantly positive feedback"
            elif negative_count > positive_count:
                feedback_summary["sentiment_summary"] = "Contains significant concerns"
            else:
                feedback_summary["sentiment_summary"] = "Mixed feedback received"

            self.logger.info("Feedback collection completed")
            return feedback_summary

        except Exception as e:
            self.logger.error(f"Error in get_stakeholder_feedback: {str(e)}")
            return {"error": str(e), "status": "failed"}


def execute_action(action: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Execute plugin actions"""
    plugin = StakeholderCommunicationPlugin()

    actions = {
        "create_update": lambda: plugin.create_update(
            parameters.get("update_data", {})
        ),
        "send_notification": lambda: plugin.send_notification(
            parameters.get("update_id", ""),
            parameters.get("notification_data", {})
        ),
        "track_response": lambda: plugin.track_response(
            parameters.get("update_id", ""),
            parameters.get("response_data", {})
        ),
        "create_report": lambda: plugin.create_report(
            parameters.get("update_id", ""),
            parameters.get("report_params", {})
        ),
        "schedule_meeting": lambda: plugin.schedule_meeting(
            parameters.get("meeting_data", {})
        ),
        "archive_update": lambda: plugin.archive_update(
            parameters.get("update_id", ""),
            parameters.get("archive_data", {})
        )
    }

    if action not in actions:
        return {"error": f"Action '{action}' not found", "status": "failed"}

    return actions[action]()
