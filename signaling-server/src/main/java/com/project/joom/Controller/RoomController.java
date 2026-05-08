package com.project.joom.Controller;

import com.project.joom.Repository.TicketRepository;
import com.project.joom.Service.RoomService;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomController {

    private final RoomService roomService;
    private final TicketRepository ticketRepository;

    @PostMapping("/{roomId}/access")
    public ResponseEntity<?> getAccessTicket(@PathVariable("roomId") String roomId, @RequestBody Map<String, String> req) {
        String sfuUrl           = roomService.getSfuUrlForRoom(roomId);
        if(sfuUrl == null ){
            sfuUrl = "ws://localhost:3000";
        }
        String userId = req.get("userId");
        ticketRepository.saveTicket(roomId, userId);


        return ResponseEntity.ok(Map.of(
                "sfuUrl", sfuUrl,
                "ticket", "generated_ticket",
                "userId", userId
        ));
    }

}
