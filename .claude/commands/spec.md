---
description: Interview user to create detailed specification
argument-hint: [topic or file path]
---

# Specification Interview

Arguments: $ARGUMENTS

## Step 1: Establish Topic

**If $ARGUMENTS provided**: Use that as the specification topic. If it's a file path, read it first.
**If no arguments**: Ask the user:
- "What topic or feature should we create a specification for?"
- "Is there an existing document or context I should read first?"

## Step 2: Deep Discovery Interview

Conduct a thorough interview using AskUserQuestion to understand every dimension of the topic. Ask about:

### Technical Implementation
- Architecture and system design
- Data models and storage
- APIs and interfaces
- Integration points with existing systems
- Technology choices and constraints
- Performance requirements and scalability
- Security and authentication needs

### User Experience
- User workflows and journeys
- UI components and interactions
- Edge cases in user behavior
- Accessibility requirements
- Error states and messaging

### Business Context
- Goals and success metrics
- Stakeholders and audiences
- Constraints (time, budget, dependencies)
- Risks and mitigation strategies

### Tradeoffs & Decisions
- Alternative approaches considered
- Explicit tradeoffs being made
- Open questions and assumptions
- Future considerations

## Interview Guidelines

- Ask non-obvious, probing questions that surface hidden complexity
- Don't ask questions with obvious answers derivable from context
- Group related questions together (2-3 per round maximum)
- Follow up on vague or incomplete answers
- Challenge assumptions politely
- Note uncertainties for later resolution

## Step 3: Continue Until Complete

Keep interviewing until you have covered:
- [ ] All major technical components
- [ ] User-facing behavior and edge cases
- [ ] Integration and dependency details
- [ ] Known tradeoffs and their rationale
- [ ] Open questions documented

Ask the user: "Is there anything else I should understand before writing the spec?"

## Step 4: Write Specification

Once the interview is complete:

1. **Confirm output location**: Ask where to save the spec (suggest `docs/specs/[topic].md` or similar)

2. **Write comprehensive spec** including:
   - Overview and goals
   - Technical architecture
   - Data models
   - API contracts
   - User flows
   - Edge cases and error handling
   - Security considerations
   - Open questions and future work
   - Decision log with rationale

3. **Review with user**: Share key sections for validation before finalizing

## Anti-Patterns

- Asking obvious or leading questions
- Accepting vague answers without follow-up
- Skipping domains (technical, UX, business)
- Writing spec before interview is truly complete
- Not documenting tradeoffs and decisions
