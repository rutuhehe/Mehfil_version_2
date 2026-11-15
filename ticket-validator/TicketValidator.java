import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class TicketValidator {
    private static final String CHECKED_IN_FILE = "checked-in.txt";

    private TicketValidator() {}

    public static void main(String[] args) {
        if (args.length != 2) {
            System.err.println("Usage: java TicketValidator <tickets.csv> <registration-uuid>");
            System.exit(2);
        }

        final UUID registrationId;
        try {
            registrationId = UUID.fromString(args[1]);
        } catch (IllegalArgumentException error) {
            System.err.println("INVALID: ticket ID must be a registration UUID.");
            System.exit(2);
            return;
        }

        try {
            Path csvPath = Path.of(args[0]);
            Ticket ticket = findTicket(csvPath, registrationId.toString());
            if (ticket == null) {
                System.out.println("INVALID: registration was not found in this event ticket export.");
                System.exit(1);
            }
            if (!"CONFIRMED".equals(ticket.registrationStatus())) {
                System.out.println("INVALID: registration status is " + ticket.registrationStatus() + ".");
                System.exit(1);
            }

            Path checkIns = csvPath.toAbsolutePath().getParent().resolve(CHECKED_IN_FILE);
            Set<String> checkedIn = readCheckIns(checkIns);
            String id = ticket.registrationId().toLowerCase();
            if (checkedIn.contains(id)) {
                System.out.println("ALREADY CHECKED IN: " + ticket.registrationId());
                System.exit(1);
            }

            Files.writeString(checkIns, id + System.lineSeparator(), StandardCharsets.UTF_8,
                    Files.exists(checkIns)
                            ? java.nio.file.StandardOpenOption.APPEND
                            : java.nio.file.StandardOpenOption.CREATE);
            System.out.println("VALID â€” ARRIVAL RECORDED");
            System.out.println("Registration: " + ticket.registrationId());
            System.out.println("Event: " + ticket.eventId());
            System.out.println("Attendance: PRESENT");
        } catch (IOException | IllegalArgumentException error) {
            System.err.println("ERROR: " + error.getMessage());
            System.exit(2);
        }
    }

    private static Ticket findTicket(Path file, String requestedId) throws IOException {
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        if (lines.isEmpty()) throw new IOException("ticket CSV is empty.");

        List<String> header = parseCsvLine(lines.get(0));
        int registrationIndex = header.indexOf("registration_id");
        int eventIndex = header.indexOf("event_id");
        int statusIndex = header.indexOf("registration_status");
        if (registrationIndex < 0 || eventIndex < 0 || statusIndex < 0) {
            throw new IOException("CSV header must contain registration_id,event_id,registration_status.");
        }

        for (int rowIndex = 1; rowIndex < lines.size(); rowIndex++) {
            if (lines.get(rowIndex).isBlank()) continue;
            List<String> row = parseCsvLine(lines.get(rowIndex));
            int maximum = Math.max(registrationIndex, Math.max(eventIndex, statusIndex));
            if (row.size() <= maximum) continue;
            if (row.get(registrationIndex).trim().equalsIgnoreCase(requestedId)) {
                return new Ticket(row.get(registrationIndex).trim(), row.get(eventIndex).trim(),
                        row.get(statusIndex).trim().toUpperCase());
            }
        }
        return null;
    }

    private static Set<String> readCheckIns(Path file) throws IOException {
        if (!Files.exists(file)) return new HashSet<>();
        Set<String> values = new HashSet<>();
        for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
            if (!line.isBlank()) values.add(line.trim().toLowerCase());
        }
        return values;
    }

    private static List<String> parseCsvLine(String line) {
        java.util.ArrayList<String> cells = new java.util.ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char current = line.charAt(i);
            if (current == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (current == ',' && !quoted) {
                cells.add(cell.toString());
                cell.setLength(0);
            } else {
                cell.append(current);
            }
        }
        cells.add(cell.toString());
        return cells;
    }

    private record Ticket(String registrationId, String eventId, String registrationStatus) {}
}

