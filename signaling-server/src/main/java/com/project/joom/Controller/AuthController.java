package com.project.joom.Controller;

import com.project.joom.DTO.LoginRequest;
import com.project.joom.Util.JwtUtil;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @PostMapping("/login")
    public String login(@RequestBody LoginRequest req) {
        return JwtUtil.createToken(req.username);
    }
}
