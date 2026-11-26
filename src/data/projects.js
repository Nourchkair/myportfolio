// Approved public projects. Exactly five. Retired project records are archived in archive/data/.
export const PROJECTS = [
  {
    "id": "acquisition",
    "num": "01",
    "title": "Customer Acquisition",
    "project": "H2Ops",
    "category": "Revenue & Growth",
    "description": "AI-powered sales intelligence and customer acquisition automation.",
    "capabilities": [
      "Sales Strategy",
      "AI Automation",
      "Revenue Growth"
    ],
    "cover": "assets/cards/acquisition.svg",
    "coverAlt": "Illustration of a customer acquisition workflow from target signals to personalized demo and CRM follow-up.",
    "overview": {
      "whatItIs": "An AI-assisted customer acquisition system that combines market research, prospect intelligence, personalized demonstrations, intelligent outreach and automated follow-ups to help businesses identify and engage potential customers more effectively.",
      "challenges": [
        "Sales teams waste time researching unsuitable prospects.",
        "Generic outreach struggles to communicate relevant value.",
        "Manual prospecting limits sales capacity.",
        "Inconsistent follow-ups result in missed opportunities.",
        "Fragmented customer information reduces pipeline visibility."
      ],
      "value": [
        "Better allocation of sales resources.",
        "More relevant and personalized customer engagement.",
        "Reduced repetitive prospecting work.",
        "More consistent follow-up and opportunity management.",
        "A more scalable customer acquisition process."
      ],
      "contribution": {
        "lead": "I worked across the commercial logic and the demo/follow-up layer, from defining who to target to connecting demo engagement with the next sales action.",
        "blocks": [
          {
            "label": "Problem",
            "text": "Generic outreach made it difficult for a prospect to see how the offer applied to their business, while the team needed replies and bookings to drive the next step."
          },
          {
            "label": "What I did",
            "text": "Defined the target segments, qualification criteria and follow-up rules used to prioritize prospects. Built parts of the H2Ops demo follow-up engine, including inbox sync and booking detection, and set up the contractor demo interface."
          },
          {
            "label": "Scope",
            "text": "I worked across strategy and implementation within a wider H2Ops acquisition workflow that also included lead sourcing, enrichment and outreach."
          }
        ]
      },
      "cta": "Understand how it works"
    },
    "flow": {
      "eyebrow": "Customer Acquisition / Business process",
      "title": "How Customer Acquisition works",
      "intro": "A connected sales process from target definition to pipeline visibility. Replies and bookings can happen during initial outreach or later follow-up.",
      "nodes": [
        {
          "id": "target",
          "num": "01",
          "title": "Define the target customer",
          "visible": "Identify the ideal customer.",
          "icon": "target",
          "x": 60,
          "y": 260,
          "explanation": "Define the ideal customer based on industry, location, company characteristics and business needs. This establishes where the sales team should focus its resources."
        },
        {
          "id": "find",
          "num": "02",
          "title": "Find new prospects",
          "visible": "Discover potential buyers.",
          "icon": "search",
          "x": 330,
          "y": 135,
          "explanation": "Identify businesses that match the target customer profile, creating a structured list of potential sales opportunities without relying exclusively on manual research."
        },
        {
          "id": "improve",
          "num": "03",
          "title": "Improve existing prospect data",
          "visible": "Identify who to contact.",
          "icon": "contact",
          "x": 330,
          "y": 385,
          "explanation": "Improve existing company records by identifying decision-makers, contact information and relevant business details, while reducing incomplete or duplicate records."
        },
        {
          "id": "prioritize",
          "num": "04",
          "title": "Prioritize opportunities",
          "visible": "Focus on promising prospects.",
          "icon": "filter",
          "x": 600,
          "y": 260,
          "explanation": "Evaluate prospects against the target profile and available business signals, such as relevant hiring activity, to determine which opportunities warrant greater attention."
        },
        {
          "id": "demo",
          "num": "05",
          "title": "AI-powered demonstrations",
          "visible": "Show personalized business value.",
          "icon": "spark",
          "x": 870,
          "y": 260,
          "explanation": "Generate personalized demonstration websites and AI experiences based on the prospect’s business, helping them understand how the proposed solution could work in their own environment."
        },
        {
          "id": "outreach",
          "num": "06",
          "title": "Intelligent outreach",
          "visible": "Create relevant sales messages.",
          "icon": "message",
          "x": 1140,
          "y": 260,
          "explanation": "Use business information and prospect context to prepare personalized messages that communicate relevant value rather than relying on generic sales pitches."
        },
        {
          "id": "nurture",
          "num": "07",
          "title": "Nurturing & follow-ups",
          "visible": "Adapt to customer engagement.",
          "icon": "repeat",
          "x": 1410,
          "y": 260,
          "explanation": "Adapt subsequent communication based on demo activity, engagement and responses. Avoid unnecessary follow-ups when a prospect replies or books."
        },
        {
          "id": "replies",
          "num": "08",
          "title": "Replies & bookings",
          "visible": "Capture sales opportunities.",
          "icon": "calendar",
          "x": 1680,
          "y": 260,
          "explanation": "Identify replies and scheduled appointments so promising conversations can be handed to the sales team and the appropriate next action can be recorded."
        },
        {
          "id": "crm",
          "num": "09",
          "title": "CRM & pipeline management",
          "visible": "Maintain sales visibility.",
          "icon": "pipeline",
          "x": 1950,
          "y": 260,
          "explanation": "Centralize prospect information, outreach history, engagement and opportunity status. Give the sales team a clearer understanding of where prospects stand and what requires attention."
        }
      ],
      "connections": [
        {
          "from": "target",
          "to": "find",
          "kind": "branch"
        },
        {
          "from": "target",
          "to": "improve",
          "kind": "branch"
        },
        {
          "from": "find",
          "to": "prioritize",
          "kind": "branch"
        },
        {
          "from": "improve",
          "to": "prioritize",
          "kind": "branch"
        },
        {
          "from": "prioritize",
          "to": "demo",
          "kind": "main"
        },
        {
          "from": "demo",
          "to": "outreach",
          "kind": "main"
        },
        {
          "from": "outreach",
          "to": "nurture",
          "kind": "conditional",
          "label": "If no reply"
        },
        {
          "from": "nurture",
          "to": "replies",
          "kind": "main"
        },
        {
          "from": "outreach",
          "to": "replies",
          "kind": "shortcut",
          "label": "Reply or booking"
        },
        {
          "from": "replies",
          "to": "crm",
          "kind": "main"
        }
      ],
      "canvas": {
        "width": 2220,
        "height": 640
      },
      "labels": [
        {
          "text": "If no reply",
          "x": 1380,
          "y": 250,
          "kind": "conditional"
        },
        {
          "text": "Reply or booking",
          "x": 1515,
          "y": 132,
          "kind": "shortcut"
        }
      ],
      "spine": {
        "from": "target",
        "to": "crm",
        "label": "CRM context supports the full process"
      },
      "hint": "Scroll in any direction · Hover or focus a step",
      "viewportLabel": "Customer Acquisition horizontal process flow",
      "scopeNote": "Business process view · Underlying components may operate as separate workflows."
    }
  },
  {
    "id": "h2ops",
    "num": "02",
    "title": "Dispatch",
    "fullTitle": "Service Dispatch & Contractor Operations",
    "project": "H2Ops Dispatch",
    "category": "Business & Operations",
    "description": "A service operations platform connecting customer demand with contractor supply through coordinated matching, communication and booking management.",
    "capabilities": [
      "Supply & Demand Coordination",
      "Operations Automation",
      "Service Management"
    ],
    "cover": "assets/cards/h2ops.svg",
    "coverAlt": "Illustration of a dispatch workflow moving from service request to contractor offer and customer confirmation.",
    "overview": {
      "whatItIs": [
        "A service operations platform designed for businesses that connect customers with independent service providers.",
        "The system combines customer intake, contractor acquisition and onboarding, service coverage, job matching, communication and booking confirmation into a coordinated operational process.",
        "Its objective is to help businesses manage both sides of a service marketplace while reducing manual coordination and improving operational visibility."
      ],
      "challenges": [
        "Time-consuming manual coordination between customers and contractors.",
        "Difficulty identifying suitable and available service providers.",
        "Fragmented communication and inconsistent follow-ups.",
        "Limited visibility into contractor readiness and service coverage.",
        "Customer requests becoming delayed or unresolved.",
        "Difficulty scaling operations without increasing administrative workload."
      ],
      "value": [
        "More efficient coordination of supply and demand.",
        "Reduced administrative and operational workload.",
        "Better utilization of contractor networks.",
        "Greater visibility into service requests and their progression.",
        "More consistent customer and contractor experiences.",
        "A more scalable service delivery model."
      ],
      "contribution": {
        "lead": "I worked on the front door of the dispatch process: how a service request enters the system and how the customer receives a reference.",
        "blocks": [
          {
            "label": "Problem",
            "text": "A request creates an expectation, but dispatch can only fulfil it when coverage, contractor readiness and availability line up."
          },
          {
            "label": "What I did",
            "text": "Built and refined the public intake flow: which request details dispatch receives, how the request is validated, and how the customer receives a confirmation reference."
          },
          {
            "label": "Scope",
            "text": "I worked on the intake-to-queue handoff; coverage, contractor activation and offer/confirmation sat within the wider Dispatch system."
          }
        ]
      },
      "cta": "Understand how it works"
    },
    "flow": {
      "eyebrow": "Service Dispatch / Business process",
      "title": "How Service Dispatch works",
      "intro": "Customer demand and contractor supply converge at matching, then move through communication and booking, with a secondary path for exceptions.",
      "nodes": [
        {
          "id": "customer",
          "num": "01",
          "title": "Customer request",
          "visible": "Understand what the customer needs.",
          "icon": "message",
          "x": 60,
          "y": 100,
          "explanation": "Customers submit a service request describing the work they need, their location and relevant preferences. This creates a structured starting point for the business instead of relying on scattered messages or phone conversations."
        },
        {
          "id": "assess",
          "num": "02",
          "title": "Assess requirements",
          "visible": "Understand the job requirements.",
          "icon": "clipboard",
          "x": 330,
          "y": 100,
          "explanation": "Organize the customer’s request into actionable information, including the type of service, job scope, location and scheduling requirements. This helps the business understand what kind of contractor is needed."
        },
        {
          "id": "coverage",
          "num": "03",
          "title": "Check service coverage",
          "visible": "Determine whether demand can be served.",
          "icon": "map",
          "x": 600,
          "y": 100,
          "explanation": "Evaluate whether the business has suitable service coverage for the customer’s location and requirements. Requests outside current coverage can help identify opportunities for contractor recruitment and future market expansion."
        },
        {
          "id": "acquire",
          "num": "04",
          "title": "Contractor acquisition",
          "visible": "Expand the service provider network.",
          "icon": "contact",
          "x": 60,
          "y": 390,
          "explanation": "Identify and recruit contractors based on the services and geographic markets the business wants to support. This helps align contractor acquisition with actual or anticipated customer demand."
        },
        {
          "id": "onboard",
          "num": "05",
          "title": "Contractor onboarding",
          "visible": "Understand each contractor’s capabilities.",
          "icon": "id",
          "x": 330,
          "y": 390,
          "explanation": "Collect relevant contractor information, including offered services, geographic coverage, availability and operating preferences. Structured contractor profiles provide the information needed to identify suitable service providers."
        },
        {
          "id": "activate",
          "num": "06",
          "title": "Contractor activation",
          "visible": "Establish contractor readiness.",
          "icon": "check",
          "x": 600,
          "y": 390,
          "explanation": "Distinguish contractors who are potential partners from those who are ready to receive service opportunities. This helps the business understand its usable service capacity rather than relying solely on the size of its contractor database."
        },
        {
          "id": "match",
          "num": "07",
          "title": "Match supply & demand",
          "visible": "Connect the request with suitable contractors.",
          "icon": "link",
          "x": 870,
          "y": 245,
          "explanation": "Identify eligible contractors based on the customer’s service requirements, location and contractor readiness. This reduces manual searching and helps allocate available service capacity more effectively."
        },
        {
          "id": "communicate",
          "num": "08",
          "title": "Coordinate communication",
          "visible": "Manage offers and responses.",
          "icon": "message",
          "x": 1140,
          "y": 245,
          "explanation": "Coordinate communication between customers, contractors and the dispatch team. Contractors receive relevant opportunities and can respond, while the business tracks the progression of each request."
        },
        {
          "id": "confirm",
          "num": "09",
          "title": "Confirm the booking",
          "visible": "Establish a clear service commitment.",
          "icon": "calendar",
          "x": 1410,
          "y": 245,
          "explanation": "Track contractor acceptance and customer confirmation as distinct steps. This gives the business greater visibility into whether a service opportunity has progressed into a confirmed arrangement."
        },
        {
          "id": "exception",
          "num": "10",
          "title": "Exception management",
          "visible": "Resolve requests that need attention.",
          "icon": "alert",
          "x": 1275,
          "y": 540,
          "tone": "exception",
          "explanation": "Identify requests that cannot progress because of unavailable contractors, expired offers, unanswered communications or coverage limitations. These requests can be reviewed, reassigned where appropriate or handled by the operations team."
        },
        {
          "id": "operations",
          "num": "11",
          "title": "Operations management",
          "visible": "Maintain visibility across the business.",
          "icon": "pipeline",
          "x": 1680,
          "y": 245,
          "explanation": "Centralize customer requests, contractor profiles, communication and booking progression. Give the operations team a clearer understanding of current demand, available supply and outstanding operational decisions."
        }
      ],
      "connections": [
        {
          "from": "customer",
          "to": "assess",
          "kind": "demand"
        },
        {
          "from": "assess",
          "to": "coverage",
          "kind": "demand"
        },
        {
          "from": "coverage",
          "to": "match",
          "kind": "demand"
        },
        {
          "from": "acquire",
          "to": "onboard",
          "kind": "supply"
        },
        {
          "from": "onboard",
          "to": "activate",
          "kind": "supply"
        },
        {
          "from": "activate",
          "to": "match",
          "kind": "supply"
        },
        {
          "from": "match",
          "to": "communicate",
          "kind": "main"
        },
        {
          "from": "communicate",
          "to": "confirm",
          "kind": "main"
        },
        {
          "from": "confirm",
          "to": "operations",
          "kind": "main"
        },
        {
          "from": "communicate",
          "to": "exception",
          "kind": "exception",
          "path": "M1245 395 C1245 480, 1330 480, 1330 540"
        },
        {
          "from": "confirm",
          "to": "exception",
          "kind": "exception",
          "path": "M1515 395 C1515 480, 1430 480, 1430 540"
        },
        {
          "from": "exception",
          "to": "match",
          "kind": "exception",
          "path": "M1275 615 C1090 615, 975 520, 975 395"
        },
        {
          "from": "exception",
          "to": "operations",
          "kind": "exception",
          "path": "M1485 615 C1600 615, 1600 320, 1680 320"
        }
      ],
      "canvas": {
        "width": 2130,
        "height": 800
      },
      "labels": [
        {
          "text": "Customer demand",
          "x": 165,
          "y": 86,
          "kind": "demand"
        },
        {
          "text": "Contractor supply",
          "x": 165,
          "y": 376,
          "kind": "supply"
        },
        {
          "text": "Exception path",
          "x": 1380,
          "y": 526,
          "kind": "exception"
        }
      ],
      "spine": {
        "from": "customer",
        "to": "operations",
        "label": "Operations supports the full process",
        "labelX": 975,
        "labelY": 695
      },
      "hint": "Scroll in any direction · Hover or focus a step",
      "viewportLabel": "Service Dispatch horizontal business process flow",
      "scopeNote": "Business process view · Not a verified live integration.",
      "start": "match"
    }
  },
  {
    "id": "communications",
    "num": "03",
    "title": "AI Customer Communications",
    "project": "H2Ops",
    "category": "AI Solutions",
    "description": "An AI-powered communication system that manages customer inquiries, conversational interactions, appointment scheduling and customer reactivation.",
    "capabilities": [
      "Conversational AI",
      "Customer Experience",
      "Communication Automation"
    ],
    "cover": "assets/cards/communications.svg",
    "coverAlt": "Illustration of separate inquiry handling and appointment communication lanes.",
    "overview": {
      "whatItIs": [
        "An AI-powered customer communication system that combines intelligent inquiry management, conversational voice and SMS agents, appointment scheduling and customer reactivation.",
        "The system helps businesses respond to customer needs, capture opportunities and manage routine conversations while reducing dependence on manual intervention."
      ],
      "challenges": [
        "Missed calls and unanswered customer inquiries.",
        "Slow response times resulting in missed opportunities.",
        "Repetitive conversations consuming employee time.",
        "Limited customer service availability outside business hours.",
        "Time-consuming manual appointment management.",
        "Underutilized customer databases.",
        "Fragmented communication across multiple channels."
      ],
      "value": [
        "Faster and more consistent customer responses.",
        "Extended customer communication availability.",
        "Reduced administrative workload.",
        "Better utilization of existing customer databases.",
        "More efficient appointment management.",
        "Increased communication capacity without proportional staffing increases."
      ],
      "contribution": {
        "lead": "I led the project end-to-end, from the initial communication problem through planning, implementation, testing and release.",
        "blocks": [
          {
            "label": "Problem",
            "text": "Slow or inconsistent responses were losing inquiries, while booking commitments needed to respect service duration and calendar availability."
          },
          {
            "label": "What I did",
            "text": "Defined the inquiry triage and appointment rules: how inquiries were captured, prioritized and routed, and when a voice or SMS response could offer or change a time. Built and tested the AI voice and SMS workflows, including booking, rescheduling and cancellation paths, then prepared the system for release."
          },
          {
            "label": "Scope",
            "text": "The voice, SMS and reactivation examples were separate workflows within one communication system; I owned the project from idea through shipping."
          }
        ]
      },
      "cta": "Understand how it works"
    },
    "flow": {
      "eyebrow": "AI Customer Communications / Business process",
      "title": "How AI Customer Communications works",
      "intro": "Incoming inquiries and customer reactivation converge into a shared understanding stage, then branch into parallel voice and SMS conversations before next actions and CRM tracking.",
      "nodes": [
        {
          "id": "inquiries",
          "num": "01",
          "title": "Incoming inquiries",
          "visible": "Capture new customer interest.",
          "icon": "message",
          "x": 60,
          "y": 80,
          "explanation": "Collect incoming customer inquiries and relevant contact information, including the source of the inquiry where available. This helps businesses organize incoming demand and reduce the likelihood of overlooking potential opportunities."
        },
        {
          "id": "reactivation",
          "num": "02",
          "title": "Customer reactivation",
          "visible": "Reconnect with existing prospects.",
          "icon": "repeat",
          "x": 60,
          "y": 400,
          "explanation": "Identify previous customers and inactive prospects who may still benefit from the business’s services. Initiate relevant conversations to uncover opportunities within the existing customer database instead of relying exclusively on new customer acquisition."
        },
        {
          "id": "understand",
          "num": "03",
          "title": "Understand customer needs",
          "visible": "Qualify and prioritize inquiries.",
          "icon": "search",
          "x": 330,
          "y": 240,
          "explanation": "Evaluate the nature, intent and relevance of each inquiry. Determine what the customer needs and which communication or follow-up approach is appropriate, allowing the business to allocate attention more effectively."
        },
        {
          "id": "voice",
          "num": "04",
          "title": "AI voice agent",
          "visible": "Handle natural phone conversations.",
          "icon": "phone",
          "x": 600,
          "y": 120,
          "tone": "channel",
          "explanation": "Enable customers to interact with an AI-powered voice receptionist capable of understanding inquiries and supporting routine customer interactions, including appointment-related requests. This reduces dependence on staff availability for routine telephone conversations."
        },
        {
          "id": "sms",
          "num": "05",
          "title": "AI SMS agent",
          "visible": "Engage customers through text.",
          "icon": "message",
          "x": 600,
          "y": 380,
          "tone": "channel",
          "explanation": "Use conversational AI to interpret customer messages, provide relevant responses and continue interactions through SMS. Customers can communicate asynchronously while the business maintains a more consistent response process."
        },
        {
          "id": "next",
          "num": "06",
          "title": "Determine next action",
          "visible": "Turn conversations into decisions.",
          "icon": "filter",
          "x": 870,
          "y": 240,
          "explanation": "Identify the appropriate next step based on the customer’s request, conversation and available information. This may involve answering a question, managing an appointment, continuing the conversation or identifying a need for human assistance."
        },
        {
          "id": "appointment",
          "num": "07",
          "title": "Appointment management",
          "visible": "Book, reschedule or cancel.",
          "icon": "calendar",
          "x": 1140,
          "y": 120,
          "explanation": "Support appointment-related requests by checking calendar availability and managing bookings, rescheduling or cancellations. This reduces administrative work and helps customers complete routine scheduling tasks more conveniently."
        },
        {
          "id": "followup",
          "num": "08",
          "title": "Follow-up & human handoff",
          "visible": "Continue or escalate conversations.",
          "icon": "contact",
          "x": 1140,
          "y": 380,
          "explanation": "Identify conversations requiring additional attention and determine whether further communication or human involvement is appropriate. The objective is to prevent opportunities from being overlooked while recognizing the limits of automated communication."
        },
        {
          "id": "crm",
          "num": "09",
          "title": "CRM & communication tracking",
          "visible": "Maintain customer interaction visibility.",
          "icon": "pipeline",
          "x": 1410,
          "y": 240,
          "explanation": "Organize customer information, inquiry status, communication history and appointment activity. Give the business a clearer understanding of ongoing conversations and outstanding customer needs."
        }
      ],
      "connections": [
        {
          "from": "inquiries",
          "to": "understand",
          "kind": "entry"
        },
        {
          "from": "reactivation",
          "to": "understand",
          "kind": "entry"
        },
        {
          "from": "understand",
          "to": "voice",
          "kind": "channel"
        },
        {
          "from": "understand",
          "to": "sms",
          "kind": "channel"
        },
        {
          "from": "voice",
          "to": "next",
          "kind": "channel"
        },
        {
          "from": "sms",
          "to": "next",
          "kind": "channel"
        },
        {
          "from": "next",
          "to": "appointment",
          "kind": "outcome"
        },
        {
          "from": "next",
          "to": "followup",
          "kind": "outcome"
        },
        {
          "from": "appointment",
          "to": "crm",
          "kind": "outcome"
        },
        {
          "from": "followup",
          "to": "crm",
          "kind": "outcome"
        }
      ],
      "canvas": {
        "width": 1720,
        "height": 720
      },
      "labels": [
        {
          "text": "Entry point A",
          "x": 165,
          "y": 66,
          "kind": "entry"
        },
        {
          "text": "Entry point B",
          "x": 165,
          "y": 386,
          "kind": "entry"
        },
        {
          "text": "Parallel conversational channels",
          "x": 705,
          "y": 104,
          "kind": "channel"
        },
        {
          "text": "Outcome paths",
          "x": 1245,
          "y": 104,
          "kind": "outcome"
        }
      ],
      "spine": {
        "from": "inquiries",
        "to": "crm",
        "label": "CRM supports the full communication lifecycle",
        "labelX": 840,
        "labelY": 615
      },
      "hint": "Scroll in any direction · Hover or focus a step",
      "viewportLabel": "AI Customer Communications horizontal business process flow",
      "scopeNote": "Business process view · Complementary workflows, not a single verified integration.",
      "start": "understand"
    }
  },
  {
    "id": "knowledge",
    "num": "04",
    "title": "B.R.A.I.N.",
    "subtitle": "Business Knowledge Assistant",
    "project": "H2Ops Brain",
    "category": "AI Solutions",
    "description": "An organizational knowledge system that transforms business documentation, operating procedures and institutional knowledge into accessible, AI-powered business intelligence.",
    "capabilities": [
      "Knowledge Management",
      "Retrieval-Augmented Generation (RAG)",
      "Enterprise AI Adoption"
    ],
    "cover": "assets/cards/knowledge.svg?v=3",
    "coverAlt": "Illustration of an operating knowledge library paired with a retrieval assistant and source evidence.",
    "overview": {
      "whatItIs": [
        "An AI-powered organizational knowledge system designed to help businesses centralize, organize and access internal knowledge.",
        "B.R.A.I.N. combines standard operating procedures, business documentation, playbooks and organizational memory with an AI knowledge assistant designed to retrieve relevant information and provide company-specific guidance.",
        "Its objective is to make organizational knowledge more accessible, actionable and useful across the business."
      ],
      "challenges": [
        "Business knowledge scattered across multiple documents and platforms.",
        "Employees spending excessive time searching for information.",
        "Repeated questions consuming management time.",
        "Inconsistent execution of business procedures.",
        "Loss of institutional knowledge when employees leave.",
        "Time-consuming employee onboarding.",
        "Generic AI assistants lacking company-specific context."
      ],
      "value": [
        "Centralized organizational intelligence.",
        "Faster access to relevant business information.",
        "More consistent execution of company procedures.",
        "Reduced dependence on individual employees’ knowledge.",
        "More efficient employee training and onboarding.",
        "Company-specific AI assistance.",
        "Better preservation of institutional knowledge."
      ],
      "contribution": {
        "lead": "I worked across the knowledge structure and the assistant experience, from defining how guidance was organized to building onboarding, chat, playbooks and organizational memory.",
        "blocks": [
          {
            "label": "Problem",
            "text": "Knowledge was scattered across documents and platforms, slowing onboarding and making routine answers depend on whoever was available."
          },
          {
            "label": "What I did",
            "text": "Defined the operating-library structure and document-access boundaries for procedures, decisions and playbooks. Implemented the assistant’s onboarding and chat experience, including the organization-scoped path that retrieved available documents and memory, and added playbook and organizational-memory features."
          },
          {
            "label": "Scope",
            "text": "The operating library and retrieval prototype remained separate systems; I worked across their knowledge structure and the assistant experience."
          }
        ]
      },
      "cta": "Understand how it works"
    },
    "flow": {
      "eyebrow": "B.R.A.I.N. / Business process",
      "title": "How B.R.A.I.N. works",
      "intro": "Organizational knowledge is captured, organized and maintained so the AI assistant can retrieve relevant context and support informed decisions. The library and retrieval prototype are complementary.",
      "nodes": [
        {
          "id": "documentation",
          "num": "01",
          "title": "Business documentation",
          "visible": "Capture how the business operates.",
          "icon": "clipboard",
          "x": 60,
          "y": 50,
          "explanation": "Collect standard operating procedures, company policies, sales playbooks and operational guidelines. Transform scattered business documentation into a structured organizational resource."
        },
        {
          "id": "memory",
          "num": "02",
          "title": "Organizational memory",
          "visible": "Preserve business knowledge and experience.",
          "icon": "book",
          "x": 60,
          "y": 300,
          "explanation": "Document important decisions, established practices, business strategies and lessons learned. Preserve valuable institutional knowledge so that it does not remain exclusively with individual employees or managers."
        },
        {
          "id": "organize",
          "num": "03",
          "title": "Organize business knowledge",
          "visible": "Create a structured knowledge library.",
          "icon": "layers",
          "x": 330,
          "y": 175,
          "tone": "focus",
          "explanation": "Organize business information into relevant categories, departments, procedures and playbooks. Establish a consistent structure that makes information easier to maintain, locate and understand."
        },
        {
          "id": "maintain",
          "num": "04",
          "title": "Maintain & update knowledge",
          "visible": "Keep organizational information relevant.",
          "icon": "repeat",
          "x": 600,
          "y": 175,
          "explanation": "Track changes to business documentation and maintain updated procedures as the organization evolves. Help distinguish established operating practices from outdated information."
        },
        {
          "id": "question",
          "num": "05",
          "title": "Employee question",
          "visible": "Ask questions in natural language.",
          "icon": "message",
          "x": 60,
          "y": 480,
          "explanation": "Allow employees to ask questions about company procedures, responsibilities, sales practices or operational requirements without manually searching through multiple documents."
        },
        {
          "id": "retrieve",
          "num": "06",
          "title": "Retrieve relevant knowledge",
          "visible": "Find the information that matters.",
          "icon": "search",
          "x": 330,
          "y": 480,
          "explanation": "Identify relevant passages within the assistant’s available knowledge sources based on the employee’s question. Retrieval-augmented generation helps provide company-specific context rather than relying exclusively on a general AI model’s knowledge."
        },
        {
          "id": "assistant",
          "num": "07",
          "title": "AI-powered business assistance",
          "visible": "Provide contextual business guidance.",
          "icon": "spark",
          "x": 600,
          "y": 480,
          "tone": "focus",
          "explanation": "Generate responses grounded in retrieved organizational information, within the appropriate organizational access boundaries. Help employees understand procedures, locate relevant guidance and navigate business processes."
        },
        {
          "id": "decisions",
          "num": "08",
          "title": "Informed decisions & execution",
          "visible": "Turn knowledge into practical action.",
          "icon": "check",
          "x": 870,
          "y": 480,
          "explanation": "Help employees make better-informed decisions, follow established procedures and complete routine tasks with greater independence. The objective is to improve organizational consistency while reducing dependence on management for routine guidance."
        }
      ],
      "connections": [
        {
          "from": "documentation",
          "to": "organize",
          "kind": "knowledge"
        },
        {
          "from": "memory",
          "to": "organize",
          "kind": "knowledge"
        },
        {
          "from": "organize",
          "to": "maintain",
          "kind": "knowledge"
        },
        {
          "from": "organize",
          "to": "retrieve",
          "kind": "conceptual",
          "path": "M435 325 V480"
        },
        {
          "from": "question",
          "to": "retrieve",
          "kind": "assistance"
        },
        {
          "from": "retrieve",
          "to": "assistant",
          "kind": "assistance"
        },
        {
          "from": "assistant",
          "to": "decisions",
          "kind": "assistance"
        }
      ],
      "canvas": {
        "width": 1140,
        "height": 720
      },
      "labels": [
        {
          "text": "Knowledge management",
          "x": 165,
          "y": 36,
          "kind": "knowledge"
        },
        {
          "text": "AI assistance",
          "x": 165,
          "y": 466,
          "kind": "assistance"
        },
        {
          "text": "Conceptual knowledge link",
          "x": 435,
          "y": 420,
          "kind": "conceptual"
        }
      ],
      "hint": "Scroll in any direction · Hover or focus a step",
      "viewportLabel": "B.R.A.I.N. horizontal business knowledge flow",
      "scopeNote": "Business process view · The knowledge library and retrieval assistant are complementary; no automatic synchronization is verified.",
      "start": "organize"
    }
  },
  {
    "id": "safiy",
    "num": "05",
    "title": "Safiy",
    "subtitle": "Contextual AI Workplace Assistant",
    "project": "Contextual AI",
    "category": "Product & Innovation",
    "description": "A local-first AI workplace assistant that transforms conversations, professional context and knowledge into intelligent assistance and business actions.",
    "capabilities": [
      "Contextual AI",
      "Workplace Productivity",
      "Product Innovation"
    ],
    "cover": "assets/cards/safiy.webp",
    "coverAlt": "Representative artwork for Safiy, a local-first contextual AI workplace assistant.",
    "overview": {
      "whatItIs": [
        "Safiy is a local-first AI workplace assistant designed to capture conversations, organize professional knowledge, provide contextual assistance and support actions across connected applications.",
        "By combining meeting intelligence, knowledge retrieval, real-time AI assistance and application integrations, Safiy bridges the gap between workplace conversations and business execution.",
        "Its objective is to make AI a contextual part of everyday professional workflows rather than a separate tool users must repeatedly provide with information."
      ],
      "provenance": "Builds on the open-source Meeting Transcriber project.",
      "challenges": [
        "Valuable information lost after meetings.",
        "Excessive time spent taking notes and preparing summaries.",
        "Difficulty retrieving information from previous conversations.",
        "Frequent switching between business applications.",
        "Manual execution of post-meeting administrative tasks.",
        "Generic AI assistants lacking relevant workplace context.",
        "Privacy concerns surrounding sensitive business conversations."
      ],
      "value": [
        "Improved meeting productivity.",
        "Better retention and accessibility of business knowledge.",
        "Reduced post-meeting administrative workload.",
        "More informed professional conversations.",
        "Greater continuity between discussions and business actions.",
        "Reduced application switching.",
        "Greater control over sensitive information."
      ],
      "contribution": {
        "lead": "I worked on the knowledge and release layer of Safiy, building on the open-source Meeting Transcriber project.",
        "blocks": [
          {
            "label": "Problem",
            "text": "Meeting context is easy to lose, but uploading recordings can create privacy and adoption barriers."
          },
          {
            "label": "What I did",
            "text": "Added Knowledge Bank imports, improved retrieval indexing and prepared beta releases."
          },
          {
            "label": "Scope",
            "text": "I worked within a local-first direction — recording and transcription on the Mac by default, with connected services treated as explicit choices. The broader assistant, connected actions and suggested tasks extend beyond the features I built."
          }
        ]
      },
      "cta": "Understand how it works"
    },
    "flow": {
      "eyebrow": "Safiy / Continuous intelligence",
      "title": "How Safiy works",
      "intro": "Conversations and connected knowledge create context for the assistant, which supports real-time help and business actions. Preserved knowledge feeds continuous intelligence back into future context.",
      "nodes": [
        {
          "id": "capture",
          "num": "01",
          "title": "Capture conversations",
          "visible": "Capture workplace discussions.",
          "icon": "mic",
          "x": 60,
          "y": 50,
          "explanation": "Record and transcribe professional conversations across virtual and in-person meetings. Transform spoken information into searchable content that can be reviewed and used beyond the original conversation."
        },
        {
          "id": "knowledge",
          "num": "02",
          "title": "Connect knowledge",
          "visible": "Bring relevant information together.",
          "icon": "book",
          "x": 60,
          "y": 300,
          "explanation": "Organize documents, reference materials, previous conversations and project-specific information through Knowledge Banks and Workspaces. Give the AI assistant access to relevant professional context rather than relying exclusively on general knowledge."
        },
        {
          "id": "context",
          "num": "03",
          "title": "Understand context",
          "visible": "Identify relevant workplace information.",
          "icon": "search",
          "x": 330,
          "y": 175,
          "explanation": "Use conversation content, meeting history and available knowledge to establish context around the user’s current activity. Retrieve relevant information to support more meaningful assistance."
        },
        {
          "id": "assistant",
          "num": "04",
          "title": "Contextual AI assistant",
          "visible": "Provide intelligence around your work.",
          "icon": "spark",
          "x": 600,
          "y": 175,
          "tone": "focus",
          "explanation": "Combine available professional context with AI capabilities to help users understand information, explore ideas, answer questions and identify potential next steps. Reduce the need to repeatedly explain the same business context to an AI assistant."
        },
        {
          "id": "realtime",
          "num": "05",
          "title": "Real-time assistance",
          "visible": "Support conversations as they happen.",
          "icon": "message",
          "x": 870,
          "y": 50,
          "explanation": "Provide contextual suggestions, relevant answers, preparation guidance and potential action recommendations during professional conversations. Help users remain focused and better informed without constantly switching between applications."
        },
        {
          "id": "actions",
          "num": "06",
          "title": "Business action execution",
          "visible": "Turn discussions into business actions.",
          "icon": "check",
          "x": 870,
          "y": 300,
          "explanation": "Support actions across connected applications such as Gmail, Google Calendar, Google Docs, Sheets and Drive. Help translate meeting discussions into practical tasks, documents, email drafts and scheduled activities, subject to supported integrations and user permissions."
        },
        {
          "id": "preserve",
          "num": "07",
          "title": "Preserve workplace knowledge",
          "visible": "Retain valuable professional context.",
          "icon": "layers",
          "x": 1140,
          "y": 175,
          "explanation": "Organize meeting transcripts, conversation history and related information within accessible workspaces. Allow users to retrieve previous discussions and relevant knowledge without manually reconstructing past events."
        },
        {
          "id": "continuous",
          "num": "08",
          "title": "Continuous intelligence",
          "visible": "Carry knowledge into future work.",
          "icon": "repeat",
          "x": 1410,
          "y": 175,
          "explanation": "Make accumulated professional knowledge available to support future conversations, questions and activities. Create continuity between past discussions and present work while maintaining user control over stored information."
        }
      ],
      "connections": [
        {
          "from": "capture",
          "to": "context",
          "kind": "context"
        },
        {
          "from": "knowledge",
          "to": "context",
          "kind": "context"
        },
        {
          "from": "context",
          "to": "assistant",
          "kind": "assist"
        },
        {
          "from": "assistant",
          "to": "realtime",
          "kind": "assist"
        },
        {
          "from": "assistant",
          "to": "actions",
          "kind": "assist"
        },
        {
          "from": "realtime",
          "to": "preserve",
          "kind": "assist"
        },
        {
          "from": "actions",
          "to": "preserve",
          "kind": "assist"
        },
        {
          "from": "preserve",
          "to": "continuous",
          "kind": "assist"
        },
        {
          "from": "continuous",
          "to": "context",
          "kind": "feedback",
          "path": "M1515 325 C1515 520, 1490 560, 1390 560 H540 C470 560, 435 520, 435 325"
        }
      ],
      "canvas": {
        "width": 1720,
        "height": 680
      },
      "labels": [
        {
          "text": "Context sources",
          "x": 165,
          "y": 36,
          "kind": "context"
        },
        {
          "text": "Assistance & action",
          "x": 975,
          "y": 36,
          "kind": "assist"
        },
        {
          "text": "Contextual AI Assistant",
          "x": 705,
          "y": 154,
          "kind": "focus"
        },
        {
          "text": "Continuous context",
          "x": 900,
          "y": 548,
          "kind": "feedback"
        }
      ],
      "hint": "Scroll in any direction · Hover or focus a step",
      "viewportLabel": "Safiy continuous intelligence product flow",
      "scopeNote": "Product concept · Builds on open-source Meeting Transcriber · Local-first; optional connected services may use external processing.",
      "start": "assistant"
    }
  }
];

export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map(project => [project.id, project]));
