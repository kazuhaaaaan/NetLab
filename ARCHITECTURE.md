# NetLab System Architecture

## 1. Architectural Philosophy

NetLab is designed from first principles following **Clean Architecture**, **SOLID Principles**, and a **Plugin Architecture**.

### Core Invariants:
1. **Zero Server Dependency**: 100% of execution occurs inside client browser threads (Web Workers & React UI layer).
2. **Strict Vendor Isolation**: Vendor CLI syntax logic NEVER contains networking code. Core networking engine NEVER contains vendor-specific code.
3. **Decoupled Renderer & State**: Simulation state is stored in pure serializable engines (`@mikrolab/core`), while rendering is executed declaratively (`@mikrolab/canvas`).
4. **Pointer Event Neutrality**: Mouse and touch gestures are unified into a high-performance Pointer Events Pipeline.

---

## 2. Command Pipeline (CLI → Engine Execution)

```
[ User Input in Terminal ]
            │
            ▼
   @mikrolab/terminal  (Captures keystrokes, provides vendor-authentic auto-complete)
            │
            ▼
    @mikrolab/vendors  (Vendor Grammar Adapter selects MikroTik/Cisco/Juniper grammar)
            │
            ▼
      @mikrolab/cli    (Lexical Analysis -> Token Stream -> AST Parser)
            │
            ▼
     Command Object    (Normalized Command: { action: 'SET_INTERFACE_IP', target: 'ether1', value: '192.168.88.1/24' })
            │
            ▼
     @mikrolab/core    (Core Engine validates state change & dispatches event)
            │
            ▼
   @mikrolab/devices   (Device Virtual Hardware updates IP/Routing table)
```

---

## 3. Interaction Engine & Gesture Architecture

```
  Raw Pointer Down / Move / Up / Cancel Events
                     │
                     ▼
        PointerTracker (Tracks active pointers)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
 singlePointerHandler      multiPointerHandler
        │                         │
  ┌─────┴─────┐             ┌─────┴─────┐
  ▼           ▼             ▼           ▼
Tap /    Long Press       Pinch      Two-Finger
Double   (Timer: 500ms)   Zoom       Pan
Tap
        │                         │
        └────────────┬────────────┘
                     ▼
         GestureEvent Dispatcher
                     │
                     ▼
          Canvas State Mutator
```

---

## 4. Package Dependency Graph

```
apps/web ──► @mikrolab/ui ──► @mikrolab/canvas ──► @mikrolab/shared
   │               │                   │
   ▼               ▼                   ▼
@mikrolab/terminal ──► @mikrolab/cli ──► @mikrolab/vendors ──► @mikrolab/sdk
   │                                           │
   ▼                                           ▼
@mikrolab/core ◄── @mikrolab/devices ◄── @mikrolab/protocols ◄── @mikrolab/packet
```

---

## 5. Security & Isolation

Since NetLab runs entirely in client memory:
- No user credentials or lab configurations are transmitted to remote servers.
- Lab files (`.mlab`) are validated against JSON schema definitions before parsing.
- Web Worker threads prevent complex packet simulations from blocking the main React UI frame thread.
